declare const google: any;

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let accessToken: string | null = null;
let tokenExpiresAt = 0;

export const getAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      return reject(new Error('VITE_GOOGLE_CLIENT_ID environment variable is missing. Please add it to your AI Studio settings.'));
    }

    if (accessToken && Date.now() < tokenExpiresAt) {
      return resolve(accessToken);
    }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            accessToken = response.access_token;
            // Token usually valid for 1 hour
            tokenExpiresAt = Date.now() + 50 * 60 * 1000;
            resolve(response.access_token);
          } else {
            console.error('OAuth Response Error:', response);
            reject(new Error('Failed to get access token: ' + (response.error || 'Unknown error')));
          }
        },
      });
      client.requestAccessToken();
    } catch (error) {
      console.error('GIS Error:', error);
      reject(error);
    }
  });
};

export interface GmailMessage {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

export const fetchRecentEmails = async (query: string): Promise<GmailMessage[]> => {
  const token = await getAccessToken();

  // Search for recent emails matching the query
  const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!searchRes.ok) {
    const errorBody = await searchRes.text();
    console.error('Gmail API Error:', errorBody);
    
    let errorMessage = `Failed to fetch messages: ${searchRes.status} ${searchRes.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.message) {
        errorMessage = errorJson.error.message;
      }
    } catch(e) {}

    throw new Error(errorMessage);
  }
  const searchData = await searchRes.json();
  
  if (!searchData.messages || searchData.messages.length === 0) {
    return [];
  }

  const messages: GmailMessage[] = [];

  // Fetch full details of each message
  for (const msgInfo of searchData.messages) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgInfo.id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json();

    const headers = msgData.payload.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
    const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
    const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date().toISOString();

    let body = '';
    
    // Extract plain text body (recursively find the text/plain part)
    const extractText = (parts: any[]) => {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          body += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (part.parts) {
          extractText(part.parts);
        }
      }
    };

    if (msgData.payload.parts) {
      extractText(msgData.payload.parts);
    } else if (msgData.payload.body?.data) {
      body = atob(msgData.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }

    if (!body) body = msgData.snippet || '';

    messages.push({
      id: msgData.id,
      snippet: msgData.snippet,
      subject,
      from,
      date,
      body
    });
  }

  return messages;
};
