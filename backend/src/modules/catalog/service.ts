import { query, withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { fetchOclPage, initialOclUrl } from "./ocl";
import { normalizeOclConcept, payloadHash } from "./normalizer";

async function sourceId() {
  const r = await query<{id:string}>(`SELECT id FROM data_sources WHERE code='DGDA_OCL_REGISTERED_DRUGS' AND enabled=true LIMIT 1`);
  if (!r.rowCount) throw new Error("DGDA OCL data source is not configured or enabled.");
  return r.rows[0].id;
}

export async function runCatalogSync() {
  const dataSourceId = await sourceId();
  const job = await query<{id:string}>(`INSERT INTO data_sync_jobs(data_source_id,job_type,status,metadata) VALUES($1,'FULL','RUNNING',$2) RETURNING id`, [dataSourceId, JSON.stringify({source:"DGDA_OCL_REGISTERED_DRUGS"})]);
  const jobId = job.rows[0].id;
  let url: string | null = initialOclUrl();
  let seen = 0, created = 0, updated = 0, unchanged = 0, invalid = 0;

  try {
    while (url) {
      const page = await fetchOclPage(url);
      for (const concept of page.concepts) {
        seen++;
        const normalized = normalizeOclConcept(concept);
        const hash = payloadHash(concept);
        if (!normalized.valid) {
          invalid++;
          await query(`INSERT INTO data_quality_issues(data_source_id,issue_code,severity,message,details) VALUES($1,'MISSING_REQUIRED_SOURCE_FIELDS','HIGH',$2,$3)`, [dataSourceId, normalized.reason, JSON.stringify({concept, jobId, sourceCode: concept?.id ?? concept?.code ?? null})]);
          continue;
        }
        const result = await withTransaction(async client => {
          const existing = await client.query<{id:string; payload_hash:string}>(`SELECT id,payload_hash FROM source_records WHERE data_source_id=$1 AND external_key=$2 FOR UPDATE`, [dataSourceId, normalized.sourceCode]);
          if (existing.rowCount && existing.rows[0].payload_hash === hash) {
            await client.query(`UPDATE source_records SET last_seen_at=NOW(),status='ACTIVE' WHERE id=$1`, [existing.rows[0].id]);
            await client.query(`UPDATE drug_products SET last_verified_at=NOW(),verification_status='VERIFIED' WHERE source_system='DGDA_OCL_REGISTERED_DRUGS' AND source_code=$1`, [normalized.sourceCode]);
            return "unchanged";
          }
          const record = await client.query<{id:string}>(`
            INSERT INTO source_records(data_source_id,external_key,source_version,payload,payload_hash,source_updated_at,last_seen_at,status)
            VALUES($1,$2,$3,$4,$5,$6,NOW(),'ACTIVE')
            ON CONFLICT(data_source_id,external_key) DO UPDATE SET
              source_version=EXCLUDED.source_version,payload=EXCLUDED.payload,payload_hash=EXCLUDED.payload_hash,
              source_updated_at=EXCLUDED.source_updated_at,last_seen_at=NOW(),status='ACTIVE'
            RETURNING id`, [dataSourceId, normalized.sourceCode, normalized.sourceVersion, JSON.stringify(normalized.rawPayload), hash, normalized.sourceUpdatedAt]);

          await client.query(`
            INSERT INTO drug_products(
              dar_identifier,trade_name,generic_name,manufacturer,strength,dosage_form,pack_size,indication,
              prescription_required,status,base_price_bdt,source_system,source_code,source_version,source_url,
              source_hash,raw_source_payload,source_updated_at,last_verified_at,verification_status
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE',0,$10,$11,$12,$13,$14,$15,$16,NOW(),'VERIFIED')
            ON CONFLICT(source_system,source_code) DO UPDATE SET
              dar_identifier=EXCLUDED.dar_identifier,trade_name=EXCLUDED.trade_name,generic_name=EXCLUDED.generic_name,
              manufacturer=EXCLUDED.manufacturer,strength=EXCLUDED.strength,dosage_form=EXCLUDED.dosage_form,
              pack_size=EXCLUDED.pack_size,indication=EXCLUDED.indication,prescription_required=EXCLUDED.prescription_required,
              source_version=EXCLUDED.source_version,source_url=EXCLUDED.source_url,source_hash=EXCLUDED.source_hash,
              raw_source_payload=EXCLUDED.raw_source_payload,source_updated_at=EXCLUDED.source_updated_at,last_verified_at=NOW(),
              verification_status='VERIFIED',updated_at=NOW()
            RETURNING id`, [normalized.darIdentifier, normalized.tradeName, normalized.genericName, normalized.manufacturer, normalized.strength,
              normalized.dosageForm, normalized.packSize, normalized.indication, normalized.prescriptionRequired,
              'DGDA_OCL_REGISTERED_DRUGS', normalized.sourceCode, normalized.sourceVersion, normalized.sourceUrl, hash, JSON.stringify(normalized.rawPayload), normalized.sourceUpdatedAt]);
          await client.query(`UPDATE data_quality_issues SET status='RESOLVED',resolved_at=NOW() WHERE data_source_id=$1 AND issue_code='MISSING_REQUIRED_SOURCE_FIELDS' AND status='OPEN' AND details->>'sourceCode'=$2`, [dataSourceId, normalized.sourceCode]);
          return existing.rowCount ? "updated" : "created";
        });
        if (result === "created") created++; else if (result === "updated") updated++; else unchanged++;
      }
      url = page.nextUrl;
      if (!url && page.concepts.length === env.oclPageSize) {
        // Some deployments omit the pagination header. Fall back to the next page only when a full page was returned.
        const current = new URL(initialOclUrl());
        const nextPage = Number(current.searchParams.get("page") ?? "1") + Math.floor(seen / env.oclPageSize);
        current.searchParams.set("page", String(nextPage));
        url = current.toString();
      }
      if (seen >= env.catalogMaxRecords) break;
    }

    await query(`UPDATE data_sync_jobs SET status=$2,completed_at=NOW(),records_seen=$3,records_created=$4,records_updated=$5,records_unchanged=$6,records_invalid=$7 WHERE id=$1`, [jobId, invalid ? "PARTIAL" : "SUCCEEDED", seen, created, updated, unchanged, invalid]);
    return { jobId, status: invalid ? "PARTIAL" : "SUCCEEDED", seen, created, updated, unchanged, invalid };
  } catch (error) {
    await query(`UPDATE data_sync_jobs SET status='FAILED',completed_at=NOW(),records_seen=$2,records_created=$3,records_updated=$4,records_unchanged=$5,records_invalid=$6,error_message=$7 WHERE id=$1`, [jobId, seen, created, updated, unchanged, invalid, String(error instanceof Error ? error.message : error)]);
    throw error;
  }
}
