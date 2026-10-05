import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger';
import { env } from '../../../../config/config';
import {
  executeAthenaQuery,
  ensureAthenaSchema,
  registerPartition,
  ANOMALY_SUGGESTIONS_TABLE,
  WELL_STATUS_TABLE,
  ANOMALY_REVIEWS_TABLE,
  DAILY_PRODUCTION_TABLE,
  TABLE_NAME as RECOMMENDATIONS_TABLE
} from '../../utils/athena-query';

export const DashboardController = {
  /**
   * Get aggregated data for the dashboard from Athena/S3
   */

  async getDashboardData(req: Request, res: Response, next: NextFunction) {
    try {
      const PERIODS = {
        day: 1,
        month: 30,
        year: 365,
        tenYears: 3650,
        economicLife: 5475,
      };

      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const orgId = user?.organization_id;
      if (!orgId) {
        throw new Error('Organization ID is required');
      }

      // 1. Ensure Athena Schema and Partitions
      await ensureAthenaSchema().catch((err) => logger.warn('Schema init warning:', err));

      // Register all required partitions
      await Promise.all([
        registerPartition(RECOMMENDATIONS_TABLE, orgId, `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/operations/`),
        registerPartition(ANOMALY_SUGGESTIONS_TABLE, orgId, `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_detection/`),
        registerPartition(ANOMALY_REVIEWS_TABLE, orgId, `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/detections/anomaly_review/`),
        registerPartition(WELL_STATUS_TABLE, orgId, `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/sensor_data/`),
        registerPartition(DAILY_PRODUCTION_TABLE, orgId, `s3://${env.AWS_ML_MODELS_BUCKET_NAME}/${orgId}/sensor_data/`)
      ]).catch(err => logger.warn('Partition registration warning:', err));

      // 2. Prepare Athena Queries

      // Aggregated Operation Suggestions
      const opAggQuery = `
        SELECT 
          sum(CAST(NULLIF(production_increase_bbl_day, '') AS DOUBLE)) as production,
          sum(CAST(NULLIF(daily_expense_benefit_usd, '') AS DOUBLE)) as loe,
          sum(CAST(NULLIF(implementation_cost_usd, '') AS DOUBLE)) as investment,
          sum(CAST(NULLIF(net_daily_benefit_usd, '') AS DOUBLE)) as net_benefit,
          count(*) as total_count
        FROM ${RECOMMENDATIONS_TABLE}
        WHERE organization_id = '${orgId}'
          AND LOWER(status) NOT IN ('dismissed', 'completed', 'rejected')
          AND "$path" NOT LIKE '%/history/%'
      `;
      const opSuggestionsPromise = executeAthenaQuery<any>(opAggQuery);

      // Grouped At-Risk Assets (Anomaly Suggestions)
      const atRiskQuery = `
        SELECT severity, count(*) as count
        FROM ${ANOMALY_SUGGESTIONS_TABLE}
        WHERE organization_id = '${orgId}'
          AND LOWER(status) NOT IN ('resolved', 'dismissed')
          AND "$path" NOT LIKE '%/history/%'
        GROUP BY severity
      `;
      const atRiskAssetsPromise = executeAthenaQuery<any>(atRiskQuery);

      // Recent Anomaly Reviews
      const recentAnomaliesQuery = `
        SELECT title, severity 
        FROM (
          SELECT title, severity, detected_at, 
                 row_number() OVER (PARTITION BY id ORDER BY detected_at DESC) as row_num
          FROM ${ANOMALY_REVIEWS_TABLE}
          WHERE organization_id = '${orgId}' 
            AND LOWER(status) NOT IN ('resolved', 'dismissed')
            AND "$path" NOT LIKE '%/history/%'
        ) WHERE row_num = 1
        ORDER BY detected_at DESC 
        LIMIT 10
      `;
      const recentAnomaliesPromise = executeAthenaQuery<any>(recentAnomaliesQuery);

      // Anomaly Review Counts by Category
      const anomalyCountsQuery = `
        SELECT category, count(*) as count
        FROM (
          SELECT id, category, status, organization_id,
                 row_number() OVER (PARTITION BY id ORDER BY detected_at DESC) as row_num
          FROM ${ANOMALY_REVIEWS_TABLE}
          WHERE organization_id = '${orgId}'
            AND "$path" NOT LIKE '%/history/%'
        ) WHERE row_num = 1 AND LOWER(status) NOT IN ('resolved', 'dismissed')
        GROUP BY category
      `;
      const anomalyCountsPromise = executeAthenaQuery<any>(anomalyCountsQuery);

      // Athena: Production Data (Migrated from Snowflake)
      const productionQuery = `
          SELECT 
              SUM(true_oil) as total_oil,
              SUM(true_gas) as total_gas,
              SUM(true_water) as total_water,
              (SUM(true_oil) + SUM(true_gas)/6) as total_boe,
              COUNT(DISTINCT asset_id) as producing_wells
          FROM ${DAILY_PRODUCTION_TABLE}
          WHERE organization_id = '${orgId}'
            AND date = (SELECT MAX(date) FROM ${DAILY_PRODUCTION_TABLE} WHERE organization_id = '${orgId}')
      `;
      const productionStatsPromise = executeAthenaQuery<any>(productionQuery).catch((err) => {
        logger.error('Error fetching production stats from Athena/S3:', err);
        return [];
      });

      // Athena: Well Status Values (Latest state from S3 Parquet)
      const wellStatusQuery = `
        SELECT status, count(*) as count
        FROM (
          SELECT status, 
                 ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(well_id)) ORDER BY COALESCE(updated_at, last_reading_timestamp) DESC) as row_num
          FROM ${WELL_STATUS_TABLE}
          WHERE organization_id = '${orgId}'
            AND "$path" NOT LIKE '%/history/%'
            AND well_id IS NOT NULL 
            AND TRIM(well_id) != ''
        ) WHERE row_num = 1
        GROUP BY status
      `;
      const wellStatusPromise = executeAthenaQuery<any>(wellStatusQuery);

      // 3. Execute All Promises concurrently
      const [
        opAggResults,
        atRiskGroups,
        recentAnomalies,
        anomalyCounts,
        productionResults,
        wellStatusResults,
      ] = await Promise.all([
        opSuggestionsPromise,
        atRiskAssetsPromise,
        recentAnomaliesPromise,
        anomalyCountsPromise,
        productionStatsPromise,
        wellStatusPromise,
      ]);

      // 4. Process and Format Data

      // -- Operation Suggestions --
      const opAgg = opAggResults[0] || {};
      const baseMetrics = {
        production: parseFloat(opAgg.production) || 0,
        loe: parseFloat(opAgg.loe) || 0,
        investment: parseFloat(opAgg.investment) || 0,
        netDailyBenefit: parseFloat(opAgg.net_benefit) || 0,
      };

      const calculateMetrics = (multiplier: number) => {
        const totalBenefit = baseMetrics.netDailyBenefit * multiplier;
        const totalInvestment = baseMetrics.investment;

        let profitabilityIndex = 0;
        if (totalInvestment > 0) {
          profitabilityIndex = totalBenefit / totalInvestment;
        }

        return {
          productionImpact: baseMetrics.production * multiplier,
          loeImpact: baseMetrics.loe * multiplier,
          npvImpact: baseMetrics.loe * multiplier,
          profitabilityIndex: Number(profitabilityIndex.toFixed(2)),
        };
      };

      const metricsBreakdown = {
        day: calculateMetrics(PERIODS.day),
        month: calculateMetrics(PERIODS.month),
        year: calculateMetrics(PERIODS.year),
        tenYears: calculateMetrics(PERIODS.tenYears),
        economicLife: calculateMetrics(PERIODS.economicLife),
      };

      // -- At Risk Assets --
      const getSeverityCount = (sev: string) => {
        return atRiskGroups
          .filter((g: any) => g.severity?.toLowerCase() === sev.toLowerCase())
          .reduce((acc: number, curr: any) => acc + (parseInt(curr.count) || 0), 0);
      };

      const criticalCount = getSeverityCount('critical');
      const highCount = getSeverityCount('high');
      const mediumCount = getSeverityCount('medium');
      const lowCount = getSeverityCount('low');
      const highPriorityCount = criticalCount + highCount;

      // -- Anomaly Counts --
      const getCategoryCount = (cat: string) => {
        return anomalyCounts
          .filter((g: any) => g.category?.toLowerCase() === cat.toLowerCase())
          .reduce((acc: number, curr: any) => acc + (parseInt(curr.count) || 0), 0);
      };

      // -- Field Health --
      let fieldHealth = {
        totalOilProduction: 0,
        totalGasProduction: 0,
        producedWater: 0,
        activeWells: 0,
        totalWells: 0,
        facilities: 19,
        averageBoe: 0,
      };

      if (productionResults.length > 0) {
        const data = productionResults[0];
        fieldHealth.totalOilProduction = parseFloat(data.total_oil) || 0;
        fieldHealth.totalGasProduction = parseFloat(data.total_gas) || 0;
        fieldHealth.producedWater = parseFloat(data.total_water) || 0;

        const producingWells = parseInt(data.producing_wells) || 0;
        fieldHealth.averageBoe = producingWells > 0 ? (parseFloat(data.total_boe) || 0) / producingWells : 0;
        fieldHealth.activeWells = producingWells;
      }

      if (wellStatusResults.length > 0) {
        fieldHealth.totalWells = wellStatusResults.reduce((sum: number, row: any) => sum + (parseInt(row.count) || 0), 0);
        fieldHealth.activeWells = wellStatusResults
          .filter((row: any) => {
            const s = row.status?.toUpperCase();
            return s === 'RUNNING' || s === 'ACTIVE' || s === 'PRODUCING';
          })
          .reduce((sum: number, row: any) => sum + (parseInt(row.count) || 0), 0);
      }

      res.status(200).json({
        fieldHealth: fieldHealth,
        operationalRecommendations: {
          highConfidenceOptimizations: parseInt(opAgg.total_count) || 0,
          metrics: metricsBreakdown,
        },
        atRiskAssets: {
          highPriorityAssetsFlagged: highPriorityCount,
          breakdown: {
            critical: criticalCount,
            high: highCount,
            medium: mediumCount,
            low: lowCount,
          },
        },
        anomalyFeed: {
          counts: {
            financial: getCategoryCount('Financial'),
            operational: getCategoryCount('Operational'),
            process: getCategoryCount('Process'),
            production: getCategoryCount('Production'),
          },
          feed: recentAnomalies,
        },
      });
    } catch (error) {
      logger.error('Error in getDashboardData:', error);
      next(error);
    }
  },
};
