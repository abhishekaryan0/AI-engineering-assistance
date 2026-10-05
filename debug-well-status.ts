
import { executeAthenaQuery, WELL_STATUS_TABLE } from './src/modules/industrial-data/utils/athena-query';

async function debugWellStatus() {
    const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';

    const columns = [
        'well_id', 'lift_type', 'status', 'last_reading_timestamp', 'last_reading_age_hours',
        'strokes_per_minute', 'motor_current', 'injection_rate', 'anomaly_count_24h',
        'critical_anomaly_count_24h', 'status_reason', 'updated_at'
    ];

    for (const col of columns) {
        try {
            console.log(`Testing well_status column: ${col}...`);
            const sql = `SELECT ${col} FROM ${WELL_STATUS_TABLE} WHERE organization_id = '${orgId}' LIMIT 1`;
            await executeAthenaQuery(sql);
            console.log(`✅ Column ${col} is OK.`);
        } catch (e: any) {
            console.error(`❌ Column ${col} FAILED:`, e.message || e);
        }
    }
}

debugWellStatus();
