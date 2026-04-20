import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

export const scanStudentList = async (base64Data: string, mimeType: string) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });

  const prompt = `Extract ALL student details from this list image without omitting any names or rows.
  RULES:
  1. Find the "Student Symbol" (e.g., "Tha-081-Bar-001" or "081-BAR-001").
  2. Extract the last 3 digits after the final hyphen (e.g., "001") as the "rollNo". If no hyphen, take the last 3 digits.
  3. Use the full "Student Symbol" as the "id".
  4. Extract "Name", "Faculty", and "Batch" for EVERY student found.
  Return as JSON array of objects.`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Data,
        mimeType
      }
    }
  ]);

  const text = result.response.text();
  // Clean up potential markdown code blocks
  const cleanJson = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanJson);
};
