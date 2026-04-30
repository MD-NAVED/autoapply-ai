import { GoogleGenAI, Type } from "@google/genai";
import { GmailMessage } from "./gmail";

let aiClient: GoogleGenAI | null = null;

function getAI() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not set. If deploying to Vercel, please set VITE_GEMINI_API_KEY.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  datePosted: string;
  salaryRange: string;
  matchScore: number;
  matchReasoning: string;
  coverLetterDraft: string;
  companyInsight: string;
  fullJobDescription: string;
  requiredSkills: string[];
  skillGaps: string[];
  yearsOfExperienceRequired: number;
  companySize: string;
  status: 'pending' | 'applying' | 'applied';
}

export interface ParsedResume {
  skills: string[];
  experience: { role: string, company: string, duration: string }[];
  education: { degree: string, school: string, year: string }[];
  summary: string;
}

export async function parseResume(resumeText: string, resumeFile: { mimeType: string, data: string } | null): Promise<ParsedResume | null> {
  const promptText = `Analyze the candidate's resume and extract the following information. Be concise.

  Resume:
  ---
  ${resumeText || "No text provided, check attached file if present."}
  ---
  `;

  const contentsParts: any[] = [{ text: promptText }];
  if (resumeFile) {
    contentsParts.push({
      inlineData: {
        mimeType: resumeFile.mimeType,
        data: resumeFile.data
      }
    });
  }

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contentsParts,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
            experience: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  role: { type: Type.STRING },
                  company: { type: Type.STRING },
                  duration: { type: Type.STRING }
                },
                required: ["role", "company", "duration"]
              } 
            },
            education: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  degree: { type: Type.STRING },
                  school: { type: Type.STRING },
                  year: { type: Type.STRING }
                },
                required: ["degree", "school", "year"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["skills", "experience", "education", "summary"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as ParsedResume;
  } catch (error: any) {
    console.error("Failed to parse resume:", error);
    if (error.message && error.message.includes("GEMINI_API_KEY")) {
      throw error;
    }
    return null;
  }
}

export async function findMatchingJobs(
  resumeText: string, 
  resumeFile: { mimeType: string, data: string } | null, 
  location: string, 
  keywords: string = ""
): Promise<JobMatch[]> {
  const promptText = `You are an expert AI autonomous job recruiter. You MUST use your Google Search tool to search the internet for CURRENT, LIVE, REAL job openings that match this candidate's resume, location, and keywords. Do not invent fake jobs.
  
  Search job boards (like LinkedIn, Indeed, Glassdoor, or company career pages) for recent job postings in ${location} that match the keywords: "${keywords}".
  
  After finding 4-6 real, live job listings that would be a great fit for this candidate, generate a JSON response.
  
  For each job:
  1. Provide the REAL company name and the REAL job title you found on the web.
  2. Estimate a realistic salary range based on the location and role if not explicitly provided.
  3. Calculate a match score (0-100) based on how well the candidate's resume fits the actual job description. 
  4. Provide a 1-2 sentence reasoning for why this is a good match based on the real job requirements.
  5. Provide a 2-3 sentence 'Company Intel' about the company, including recent news, funding information, and estimated Glassdoor rating to provide context.
  6. Provide the full job description or a very detailed summary of the responsibilities and requirements of the role you found.
  7. Write a highly tailored, professional short cover letter draft (3-4 paragraphs) that the candidate can use to apply for this specific role, explicitly mapping their past experiences from the resume to the real job description you found.
  8. Extract an array of key skills required for this job.
  9. Analyze the job description and extract the minimum years of experience required (use 0 for entry level).
  10. Determine a realistic company size category (e.g. '1-50', '51-200', '201-500', '500-1000', '1000+').
  
  Candidate Resume (Text):
  ---
  ${resumeText || "No text provided, check attached file if present."}
  ---
  
  Target Location: ${location}
  Preferences/Keywords: ${keywords}
  `;

  const contentsParts: any[] = [{ text: promptText }];
  if (resumeFile) {
    contentsParts.push({
      inlineData: {
        mimeType: resumeFile.mimeType,
        data: resumeFile.data
      }
    });
  }

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contentsParts,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "List of matched jobs and customized applications.",
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              company: { type: Type.STRING },
              location: { type: Type.STRING },
              isRemote: { type: Type.BOOLEAN, description: "True if the job is remote" },
              datePosted: { type: Type.STRING, description: "When the job was posted, e.g., '2 days ago', 'Today', '1 week ago'" },
              salaryRange: { type: Type.STRING },
              matchScore: { type: Type.INTEGER },
              matchReasoning: { type: Type.STRING },
              coverLetterDraft: { type: Type.STRING },
              companyInsight: { type: Type.STRING, description: "A brief summary including recent news, funding info, and estimated Glassdoor rating if available." },
              fullJobDescription: { type: Type.STRING, description: "The full job description or detailed summary of the role." },
              requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key skills required for this job" },
              skillGaps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific skills mentioned in the job description that the resume lacks. Return short bullet points." },
              yearsOfExperienceRequired: { type: Type.INTEGER, description: "The minimum years of experience required (estimate 0 for entry level)" },
              companySize: { type: Type.STRING, description: "The estimated size of the company, e.g., '1-50', '51-200', '201-500', '500-1000', '1000+'" },
            },
            required: ["title", "company", "location", "isRemote", "datePosted", "salaryRange", "matchScore", "matchReasoning", "coverLetterDraft", "companyInsight", "fullJobDescription", "requiredSkills", "skillGaps", "yearsOfExperienceRequired", "companySize"]
          }
        }
      }
    });

    const parsedArray = JSON.parse(response.text || "[]");
    return parsedArray.map((job: any) => ({
      ...job,
      id: Math.random().toString(36).substring(7),
      status: 'pending'
    }));
  } catch (error: any) {
    console.error("Error generating jobs:", error);
    if (error.message && error.message.includes("GEMINI_API_KEY")) {
      throw error;
    }
    throw new Error("Failed to find jobs via AI.");
  }
}

export interface JobUpdateAnalysis {
  status: 'Interviewing' | 'Offer Received' | 'Rejected' | 'Applied';
  notes: string;
}

export async function analyzeEmailForJobUpdate(company: string, jobTitle: string, emails: GmailMessage[]): Promise<JobUpdateAnalysis | null> {
  if (emails.length === 0) return null;

  const emailTextList = emails.map(m => `--- Email Subject: ${m.subject} | From: ${m.from} | Date: ${m.date} ---\n${m.body}`).join('\n\n');

  const promptText = `Analyze the following recent emails the user received. We are tracking a job application for "${jobTitle}" at "${company}".
  
Based on these emails, determine if there's been an update on this specific job application.
Determine the new status from one of the following: 'Interviewing', 'Offer Received', 'Rejected', or 'Applied' (if no meaningful progression yet).
Write a brief 1-2 sentence summary for 'notes', e.g. "Scheduled interview for tomorrow." or "Got a canned rejection email."

If no relevant email regarding this company and role is found, return "Applied" and empty notes.

Emails text:
${emailTextList}
`;

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['Interviewing', 'Offer Received', 'Rejected', 'Applied'] },
            notes: { type: Type.STRING }
          },
          required: ["status", "notes"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (data.status && data.notes !== undefined) {
      // If nothing happens or it just says applied and empty notes, we might ignore updates
      if (data.status === 'Applied' && data.notes.length < 5) return null;
      return data as JobUpdateAnalysis;
    }
    return null;
  } catch (error) {
    console.error("Failed to analyze emails for update:", error);
    return null;
  }
}
