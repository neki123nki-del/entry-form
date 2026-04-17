import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

export const scanStudentList = async (base64Data: string, mimeType: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING, description: 'The full student symbol' },
            rollNo: { type: SchemaType.STRING, description: 'The last 3 digits of the symbol' },
            name: { type: SchemaType.STRING },
            faculty: { type: SchemaType.STRING },
            batch: { type: SchemaType.STRING }
          },
          required: ['id', 'rollNo', 'name', 'faculty', 'batch']
        }
      }
    }
  });

  const response = await model.generateContent([
    { inlineData: { data: base64Data, mimeType } },
    { text: 'Extract student details from this list image.\n\n' +
            'RULES:\n' +
            '1. Find the "Student Symbol" (e.g., "Tha-081-Bar-001" or "081-BAR-001").\n' +
            '2. Extract the last 3 digits after the final hyphen (e.g., "001") as the "rollNo". If no hyphen, take the last 3 digits.\n' +
            '3. Use the full "Student Symbol" as the "id".\n' +
            '4. Extract "Name", "Faculty", and "Batch".\n\n' +
            'Return as a JSON array of objects.' }
  ]);

  return JSON.parse(response.response.text());
};
