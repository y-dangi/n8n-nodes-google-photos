import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class GooglePhotosOAuth2Api implements ICredentialType {
  name = 'googlePhotosOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Google Photos OAuth2';
  documentationUrl = 'https://developers.google.com/photos/library/guides/get-started-library';

  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'authorizationCode',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      default: 'https://accounts.google.com/o/oauth2/v2/auth',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: 'https://oauth2.googleapis.com/token',
    },
    {
      // Three scopes required post-March 2025:
      // - appendonly: upload new media items and create albums
      // - readonly.appcreateddata: read back only items this app created
      // - photospicker.mediaitems.readonly: full-library access via Picker API
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: [
        'https://www.googleapis.com/auth/photoslibrary.appendonly',
        'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
        'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
      ].join(' '),
    },
    {
      // access_type=offline gets a refresh token; prompt=consent forces Google
      // to always issue a refresh token even for previously-authorised apps.
      displayName: 'Auth URI Query Parameters',
      name: 'authQueryParameters',
      type: 'hidden',
      default: 'access_type=offline&prompt=consent',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'body',
    },
  ];
}
