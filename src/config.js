import dotenv from "dotenv";
import OpenAI from "openai";
import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";

dotenv.config({ quiet: true });

export const MODELO = process.env.AGENT_MODEL || "gemini-3.5-flash-lite";

// Gemini expone un endpoint compatible con la API de OpenAI; el SDK de agentes lo usa sin cambios.
setDefaultOpenAIClient(
  new OpenAI({
    apiKey: process.env.GOOGLE_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    maxRetries: 6,
  })
);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);
