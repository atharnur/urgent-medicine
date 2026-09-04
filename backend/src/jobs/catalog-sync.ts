import "dotenv/config";
import { runCatalogSync } from "../modules/catalog/service";

runCatalogSync()
  .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(error => { console.error(error); process.exit(1); });
