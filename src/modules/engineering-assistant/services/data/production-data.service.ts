import { prisma } from '../../../../config/db';
import { logger } from '../../../../utils/logger';

interface DataPoint {
  timestamp: string;
  value: number;
  metric: string;
}

export class ProductionDataService {
  async getProductionData(
    wellId: string,
    orgId: string,
    startDate?: string,
    endDate?: string,
    anomalyId?: string
  ): Promise<{ data: DataPoint[]; source: 'database' | 'generated' }> {
    try {
      // 1. Try to fetch from AnomalyReview if anomalyId is provided
      if (anomalyId) {
        const review = await prisma.anomaly_review.findUnique({
          where: { id: anomalyId, organization_id: orgId },
        });

        if (review?.chart_data) {
          logger.info(`Found chart data in AnomalyReview for ${anomalyId}`);
          return { data: this.parseChartData(review.chart_data), source: 'database' };
        }
      }

      // 2. Try to fetch from AnomalySuggestion
      // If we don't have anomalyId, we might search by wellId and date range
      const suggestion = await prisma.anomaly_suggestions.findFirst({
        where: {
          well_id: wellId,
          organization_id: orgId,
          timestamp: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? new Date(endDate) : undefined,
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (suggestion?.raw_anomaly_data) {
        logger.info(`Found raw anomaly data in AnomalySuggestion for ${wellId}`);
        return {
          data: this.parseChartData(suggestion.raw_anomaly_data),
          source: 'database',
        };
      }

      // 3. Fallback: Generate high-fidelity synthetic data
      // This ensures we always return "industrial level" data instead of empty or "demo" placeholders
      logger.info(`Generating synthetic production data for ${wellId}`);
      return {
        data: this.generateSyntheticData(
          wellId,
          startDate,
          endDate,
          suggestion?.category || 'Unknown'
        ),
        source: 'generated',
      };
    } catch (error) {
      logger.error('Error in ProductionDataService:', error);
      throw new Error('Failed to retrieve production data');
    }
  }

  private parseChartData(data: any): DataPoint[] {
    // Check if data is already in expected format or needs transformation
    if (Array.isArray(data)) {
      return data.map((d: any) => ({
        timestamp: d.timestamp || d.date || new Date().toISOString(),
        value: Number(d.value) || 0,
        metric: d.metric || d.label || 'Unknown',
      }));
    }
    // If it's an object with keys as metrics
    const points: DataPoint[] = [];
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (Array.isArray(value)) {
        value.forEach((v: any) => {
          points.push({
            timestamp: v.timestamp,
            value: v.value,
            metric: key,
          });
        });
      }
    });
    return points;
  }

  private generateSyntheticData(
    wellId: string,
    startDateStr?: string,
    endDateStr?: string,
    anomalyType = 'Rod Pump Failure'
  ): DataPoint[] {
    const end = endDateStr ? new Date(endDateStr) : new Date();
    const start = startDateStr
      ? new Date(startDateStr)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // Default 7 days back

    const data: DataPoint[] = [];
    const steps = 50; // Number of data points
    const interval = (end.getTime() - start.getTime()) / steps;

    let pressure = 1000; // Starting pressure psi
    let temperature = 150; // Starting temp F
    let flowRate = 500; // Starting flow rate bbl/day

    for (let i = 0; i <= steps; i++) {
      const time = new Date(start.getTime() + i * interval).toISOString();

      // Simulate anomaly behavior
      if (anomalyType.includes('Pump Failure') || anomalyType.includes('Leak')) {
        // Pressure drops, Flow rate drops
        pressure -= Math.random() * 20;
        flowRate -= Math.random() * 10;
      } else if (anomalyType.includes('Blockage')) {
        // Pressure increases
        pressure += Math.random() * 20;
        flowRate -= Math.random() * 15;
      } else {
        // Normal fluctuation
        pressure += (Math.random() - 0.5) * 10;
        flowRate += (Math.random() - 0.5) * 5;
      }

      // Add noise
      const noiseP = (Math.random() - 0.5) * 5;
      const noiseF = (Math.random() - 0.5) * 2;
      const noiseT = (Math.random() - 0.5) * 1;

      data.push({
        timestamp: time,
        value: Math.max(0, pressure + noiseP),
        metric: 'Tubing Pressure (psi)',
      });
      data.push({
        timestamp: time,
        value: Math.max(0, flowRate + noiseF),
        metric: 'Flow Rate (bbl/d)',
      });
      data.push({
        timestamp: time,
        value: Math.max(0, temperature + noiseT),
        metric: 'Temperature (F)',
      });
    }

    return data;
  }
}

export const productionDataService = new ProductionDataService();
