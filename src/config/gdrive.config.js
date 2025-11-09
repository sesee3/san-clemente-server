import path from "node:path";
import process from "node:process";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive.metadata.readonly"];
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

const auth = new google.auth.OAuth2(
  process.env.GDRIVE_CLIENT_ID,
  process.env.GDRIVE_CLIENT_SECRET,
  process.env.GDRIVE_REDIRECT_URI
);

export async function listFiles() {

  // Create a new Drive API client.
  const drive = google.drive({ version: "v3", auth });

  const result = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
  });
  const files = result.data.files;
  if (!files || files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:");
  files.forEach((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

export async function addDriveDirectory(directoryName) {
  const drive = google.drive({ version: "v2", auth });

  const directoryMetadata = {
    name: directoryName,
    mimeType: "application/vnd.google-apps.folder",
  };

  try {
    const directory = await drive.files.create({
      requestBody: directoryMetadata,
      fileds: "id, name",
    });

    return `Cartella ${directory.data} creata.`;
  } catch (error) {
    return error;
  }
}
