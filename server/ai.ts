import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

export const scanStudentList = async (base64Data: string, mimeType: string) => {
  throw new Error('AI Scanning feature is currently disabled and all API keys have been removed.');
};
