import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import routes from "./routes";
import { env } from "./config/env";
import { errorHandler, requestId } from "./middleware/errors";
import { requireCsrf } from "./middleware/csrf";
import { apiRateLimiter, requireJsonContentType, rejectUnexpectedContentLength } from "./middleware/security-hardening";
import { pool } from "./config/db";
import { assertProductionConfig } from "./config/operational";

assertProductionConfig();

export const app=express();
app.disable("x-powered-by");
app.set("trust proxy", env.nodeEnv === "production" ? 1 : false);
app.use(helmet());
app.use(cors({origin:env.frontendOrigin,credentials:true,maxAge:env.corsMaxAgeSeconds}));
app.use(rejectUnexpectedContentLength);
app.use(requireJsonContentType);
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true, limit:"1mb"}));
app.use(cookieParser());
app.use(requestId);
app.use("/api/v1", apiRateLimiter);
app.use("/api/v1/auth",rateLimit({windowMs:15*60*1000,max:30,standardHeaders:true,legacyHeaders:false,handler:(_req,res)=>res.status(429).json({success:false,error:{code:"RATE_LIMITED",message:"Too many authentication requests. Please try again later."}})}));
app.use("/api/v1", requireCsrf);
app.get("/health",(_req,res)=>res.status(200).json({ok:true,service:"urgent-medicine-api",version:process.env.APP_VERSION ?? "unknown"}));
app.get("/version",(_req,res)=>res.status(200).json({service:"urgent-medicine-api",version:process.env.APP_VERSION ?? "unknown",environment:env.nodeEnv}));
app.get("/ready",async(_req,res)=>{
  try { await pool.query("SELECT 1"); res.status(200).json({ok:true,ready:true,service:"urgent-medicine-api"}); }
  catch { res.status(503).json({ok:false,ready:false,service:"urgent-medicine-api"}); }
});
app.use("/api/v1",routes);
app.use(errorHandler);
