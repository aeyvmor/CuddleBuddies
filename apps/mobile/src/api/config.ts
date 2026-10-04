/**
 * Deployment and team ids (not secrets: every API call needs a Cognito token).
 * From docs/api/integration-guide.md / packages/api-client ASTIG_DEV.
 */
export const ASTIG_DEV = {
  baseUrl: "https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com",
  cognitoRegion: "ap-southeast-1",
  cognitoUserPoolId: "ap-southeast-1_uYQoBKBkj",
  cognitoClientId: "7dgk8feqomk5d5q0vr81fp7m86",
} as const;

/** The team's registered (non-synthetic) phone and car. The labels typed on the setup screen stay local. */
export const TEAM_DEVICE_ID = "ba6abd4c-13a1-4c81-814c-de9e4baa29aa";
export const TEAM_VEHICLE_ID = "a6087bec-3fd1-4c10-a6d8-7c2acbf87375";

/** Long edge of the uploaded copy (the full-resolution original stays on the phone). */
export const UPLOAD_LONG_EDGE_PX = 1600;
export const UPLOAD_JPEG_QUALITY = 0.8;
