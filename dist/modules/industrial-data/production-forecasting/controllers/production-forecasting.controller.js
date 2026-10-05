"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionForecastingController = void 0;
const snowflake_1 = require("../../../../utils/snowflake");
const logger_1 = require("../../../../utils/logger");
const TABLE_NAME = 'WELL_DAILY_PRODUCTION';
class ProductionForecastingController {
    static async getWellList(req, res) {
        try {
            const sql = `SELECT DISTINCT WELL_ID FROM ${TABLE_NAME} ORDER BY WELL_ID ASC;`;
            const results = await (0, snowflake_1.executeQuery)(sql);
            const wellIds = results.map((row) => row.WELL_ID);
            res.status(200).json(wellIds);
        }
        catch (error) {
            logger_1.logger.error('Error fetching well list from Snowflake:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
    static async getProductionForecasting(req, res) {
        try {
            const { well_ids } = req.query; // Expects ?well_ids=WellA,WellB,...
            let binds = [];
            let whereClause = '';
            if (well_ids && typeof well_ids === 'string' && well_ids.length > 0) {
                const ids = well_ids.split(',');
                whereClause = `WHERE WELL_ID IN (${ids.map(() => '?').join(',')})`;
                binds = ids;
            }
            const sql = `
                SELECT
                    DATE AS "timestamp",
                    SUM(OIL_VOLUME) AS "oil",
                    SUM(GAS_VOLUME) AS "gas",
                    SUM(WATER_VOLUME) AS "water",
                    SUM(BOE) AS "boe"
                FROM
                    ${TABLE_NAME}
                ${whereClause}
                GROUP BY
                    DATE
                ORDER BY
                    DATE ASC;
            `;
            const aggregatedData = await (0, snowflake_1.executeQuery)(sql, binds);
            res.status(200).json(aggregatedData);
        }
        catch (error) {
            logger_1.logger.error('Error fetching production data from Snowflake:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
exports.ProductionForecastingController = ProductionForecastingController;
