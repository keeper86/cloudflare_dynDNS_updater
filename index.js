import axios from 'axios';
import dotenv from 'dotenv';
import Cloudflare from 'cloudflare';
dotenv.config();

const {
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ZONE_ID,
    CLOUDFLARE_RECORD_NAMES,
    CLOUDFLARE_RECORD_TYPE = 'A',
    UPDATE_INTERVAL_MINUTES = 5,
} = process.env;

if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID || !CLOUDFLARE_RECORD_NAMES) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

const getPublicIP = async () => {
    const url = CLOUDFLARE_RECORD_TYPE === 'AAAA' ? 'https://api64.ipify.org' : 'https://api.ipify.org';
    const { data } = await axios.get(url);
    return data.trim();
};

const cf = new Cloudflare({ token: CLOUDFLARE_API_TOKEN });

const getDNSRecord = async (recordName) => {
    const records = await cf.dns.records.list({
        zone_id: CLOUDFLARE_ZONE_ID,
        type: CLOUDFLARE_RECORD_TYPE,
        name: recordName,
    });
    let record = null;
    for await (const r of records) {
        record = r;
        break;
    }
    if (!record) throw new Error(`DNS record not found for ${recordName}`);
    return record;
};

const updateDNSRecord = async (recordId, recordName, ip) => {
    const result = await cf.dns.records.edit(recordId, {
        zone_id: CLOUDFLARE_ZONE_ID,
        type: CLOUDFLARE_RECORD_TYPE,
        name: recordName,
        content: ip,
        ttl: 1,
        proxied: true,
    });
    return result;
};

const run = async () => {
    try {
        const ip = await getPublicIP();
        const recordNames = CLOUDFLARE_RECORD_NAMES.split(',')
            .map((n) => n.trim())
            .filter(Boolean);
        for (const recordName of recordNames) {
            try {
                const record = await getDNSRecord(recordName);
                if (record.content !== ip) {
                    await updateDNSRecord(record.id, recordName, ip);
                    console.log(`[${new Date().toISOString()}] Updated DNS record for ${recordName} to ${ip}`);
                } else {
                    console.log(
                        `[${new Date().toISOString()}] No update needed for ${recordName}. Current IP is ${ip}`,
                    );
                }
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Error processing ${recordName}:`, err.message);
            }
        }
    } catch (err) {
        console.error(`[${new Date().toISOString()}] General error:`, err.message);
    }
};

run();
setInterval(run, Number(UPDATE_INTERVAL_MINUTES) * 60 * 1000);
