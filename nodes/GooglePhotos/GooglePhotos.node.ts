import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIBRARY = 'https://photoslibrary.googleapis.com/v1';
const PICKER  = 'https://photospicker.googleapis.com/v1';
const CRED    = 'googleOAuth2Api';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Generic authenticated JSON request.
 */
async function apiRequest(
  this: IExecuteFunctions,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: IDataObject,
  qs?: IDataObject,
): Promise<IDataObject> {
  const opts: Record<string, unknown> = { method, url, json: true };
  if (body && Object.keys(body).length) opts.body = body;
  if (qs  && Object.keys(qs).length)   opts.qs   = qs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await (this.helpers.requestWithAuthentication as any).call(this, CRED, opts))) as IDataObject;
}

/**
 * Handles paginated GET or POST endpoints, respecting returnAll / limit.
 * Pagination params go in the body for POST or in qs for GET.
 */
async function apiRequestAllItems(
  this: IExecuteFunctions,
  method: 'GET' | 'POST',
  url: string,
  dataKey: string,
  body: IDataObject = {},
  qs: IDataObject = {},
  returnAll = false,
  limit = 50,
): Promise<IDataObject[]> {
  const all: IDataObject[] = [];
  let pageToken: string | undefined;
  const pageSize = Math.min(returnAll ? 100 : limit, 100);

  do {
    let resp: IDataObject;
    if (method === 'POST') {
      resp = await apiRequest.call(this, 'POST', url, {
        ...body, pageSize, ...(pageToken ? { pageToken } : {}),
      });
    } else {
      resp = await apiRequest.call(this, 'GET', url, undefined, {
        ...qs, pageSize, ...(pageToken ? { pageToken } : {}),
      });
    }

    const items = (resp[dataKey] as IDataObject[]) ?? [];
    all.push(...items);
    pageToken = resp.nextPageToken as string | undefined;

    if (!returnAll && all.length >= limit) break;
  } while (pageToken);

  return returnAll ? all : all.slice(0, limit);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Convert an ISO-8601 date string to the Google Photos Date object { year, month, day }. */
function isoToGDate(iso: string): IDataObject {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ─── Node ─────────────────────────────────────────────────────────────────────

export class GooglePhotos implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Google Photos',
    name: 'googlePhotos',
    icon: 'file:googlePhotos.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description:
      'Work with Google Photos. Upload and manage app-created content via the Library API, or let the user pick any photo from their full library via the Picker API.',
    defaults: { name: 'Google Photos' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{
      name: CRED,
      required: true,
      // Use n8n's built-in Google OAuth2 API credential.
      // When creating the credential, paste these scopes into the Scope field
      // (space-separated):
      //   https://www.googleapis.com/auth/photoslibrary.appendonly
      //   https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata
      //   https://www.googleapis.com/auth/photospicker.mediaitems.readonly
    }],
    properties: [

      // ── Resource ───────────────────────────────────────────────────────────
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Media Item', value: 'mediaItem' },
          { name: 'Album',      value: 'album'     },
          { name: 'Picker',     value: 'picker'    },
        ],
        default: 'mediaItem',
      },

      // ── Operations: Media Item ─────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['mediaItem'] } },
        options: [
          {
            name: 'Get',
            value: 'get',
            description:
              'Get a single media item by ID. ⚠️ Only items uploaded by this app are accessible via the Library API — use the Picker resource to access items from the user\'s full library.',
            action: 'Get a media item',
          },
          {
            name: 'List',
            value: 'list',
            description:
              'List media items. ⚠️ Only items uploaded by this app are returned. To access the user\'s full photo library, use the Picker resource.',
            action: 'List media items',
          },
          {
            name: 'Search',
            value: 'search',
            description:
              'Search media items by filters or album. ⚠️ Only app-created items are returned. Use the Picker resource for full-library access.',
            action: 'Search media items',
          },
          {
            name: 'Upload',
            value: 'upload',
            description: 'Upload a photo or video from a binary property and create a new media item',
            action: 'Upload a media item',
          },
        ],
        default: 'list',
      },

      // ── Operations: Album ──────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['album'] } },
        options: [
          { name: 'Add Enrichment', value: 'addEnrichment', description: 'Add a text or location enrichment to an album',            action: 'Add album enrichment'  },
          { name: 'Add Items',      value: 'addItems',      description: 'Add existing media items to an album (max 50 at a time)',   action: 'Add items to album'    },
          { name: 'Create',         value: 'create',        description: 'Create a new album',                                        action: 'Create an album'       },
          { name: 'Get',            value: 'get',           description: 'Get an album by ID',                                        action: 'Get an album'          },
          { name: 'List',           value: 'list',          description: 'List albums created by this app',                           action: 'List albums'           },
          { name: 'Set Cover Photo', value: 'setCover',     description: 'Set the cover photo of an album',                           action: 'Set album cover photo' },
        ],
        default: 'list',
      },

      // ── Operations: Picker ─────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['picker'] } },
        options: [
          {
            name: 'Create Session',
            value: 'createSession',
            description:
              'Start a Picker session. Returns a pickerUri for the user to select photos from their full Google Photos library. Note: pickerUri expires and stops working once the user taps Done.',
            action: 'Create a picker session',
          },
          {
            name: 'Delete Session',
            value: 'deleteSession',
            description:
              'Delete a picker session. Google recommends deleting completed or abandoned sessions to clean up resources.',
            action: 'Delete a picker session',
          },
          {
            name: 'Get Session',
            value: 'getSession',
            description:
              'Poll a picker session. When mediaItemsSet is true the user has finished selecting — call List Session Items next.',
            action: 'Get a picker session',
          },
          {
            name: 'List Session Items',
            value: 'listSessionItems',
            description:
              'List the media items selected by the user in a completed picker session',
            action: 'List picker session items',
          },
        ],
        default: 'createSession',
      },

      // ═══════════════════════════════════════════════════════════════════════
      // ── Field definitions ─────────────────────────────────────────────────
      // ═══════════════════════════════════════════════════════════════════════

      // ── Media Item: Get ───────────────────────────────────────────────────
      {
        displayName: 'Media Item ID',
        name: 'mediaItemId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['get'] } },
        description: 'ID of the media item. Must be an item created by this app.',
      },

      // ── Media Item: Search ────────────────────────────────────────────────
      {
        displayName: 'Album ID',
        name: 'searchAlbumId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['search'] } },
        description:
          'Restrict results to this album. When set, the Filters options below are ignored. The album must have been created by this app.',
      },
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        displayOptions: { show: { resource: ['mediaItem'], operation: ['search'] } },
        description:
          'Filters applied to the media item search. Ignored when Album ID is set. Only app-created items are returned.',
        options: [
          {
            displayName: 'Media Type',
            name: 'mediaTypeFilter',
            type: 'options',
            options: [
              { name: 'All Media',    value: 'ALL_MEDIA' },
              { name: 'Photos Only',  value: 'PHOTO'     },
              { name: 'Videos Only',  value: 'VIDEO'     },
            ],
            default: 'ALL_MEDIA',
          },
          {
            displayName: 'Start Date',
            name: 'startDate',
            type: 'dateTime',
            default: '',
            description: 'Include items on or after this date',
          },
          {
            displayName: 'End Date',
            name: 'endDate',
            type: 'dateTime',
            default: '',
            description: 'Include items on or before this date',
          },
          {
            displayName: 'Include Archived Media',
            name: 'includeArchivedMedia',
            type: 'boolean',
            default: false,
            description: 'Whether to include archived media items in results',
          },
        ],
      },

      // ── Media Item: Upload ────────────────────────────────────────────────
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        required: true,
        default: 'data',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['upload'] } },
        description: 'Name of the binary property that contains the file to upload',
      },
      {
        displayName: 'File Name',
        name: 'uploadFileName',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['upload'] } },
        description:
          'File name stored in Google Photos. Leave blank to use the binary property\'s fileName.',
      },
      {
        displayName: 'Description',
        name: 'uploadDescription',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['upload'] } },
        description: 'Optional description for the uploaded media item',
      },
      {
        displayName: 'Album ID',
        name: 'uploadAlbumId',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['mediaItem'], operation: ['upload'] } },
        description: 'Optionally add the uploaded item directly to an existing app-created album',
      },

      // ── Album: shared Album ID ────────────────────────────────────────────
      {
        displayName: 'Album ID',
        name: 'albumId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: { resource: ['album'], operation: ['get', 'addItems', 'addEnrichment', 'setCover'] },
        },
      },

      // ── Album: Create ─────────────────────────────────────────────────────
      {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        required: true,
        default: '',
        displayOptions: { show: { resource: ['album'], operation: ['create'] } },
        description: 'Title for the new album (max 500 characters)',
      },

      // ── Album: Add Items ──────────────────────────────────────────────────
      {
        displayName: 'Media Item IDs',
        name: 'mediaItemIds',
        type: 'string',
        required: true,
        default: '',
        displayOptions: { show: { resource: ['album'], operation: ['addItems'] } },
        description: 'Comma-separated media item IDs to add to the album (max 50)',
      },

      // ── Album: Add Enrichment ─────────────────────────────────────────────
      {
        displayName: 'Enrichment Type',
        name: 'enrichmentType',
        type: 'options',
        required: true,
        options: [
          { name: 'Text',     value: 'text'     },
          { name: 'Location', value: 'location' },
        ],
        default: 'text',
        displayOptions: { show: { resource: ['album'], operation: ['addEnrichment'] } },
      },
      {
        displayName: 'Text',
        name: 'enrichmentText',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['album'], operation: ['addEnrichment'], enrichmentType: ['text'] },
        },
        description: 'Text enrichment content (max 1000 characters)',
      },
      {
        displayName: 'Location Name',
        name: 'locationName',
        type: 'string',
        default: '',
        displayOptions: {
          show: { resource: ['album'], operation: ['addEnrichment'], enrichmentType: ['location'] },
        },
      },
      {
        displayName: 'Latitude',
        name: 'latitude',
        type: 'number',
        typeOptions: { numberPrecision: 6 },
        default: 0,
        displayOptions: {
          show: { resource: ['album'], operation: ['addEnrichment'], enrichmentType: ['location'] },
        },
      },
      {
        displayName: 'Longitude',
        name: 'longitude',
        type: 'number',
        typeOptions: { numberPrecision: 6 },
        default: 0,
        displayOptions: {
          show: { resource: ['album'], operation: ['addEnrichment'], enrichmentType: ['location'] },
        },
      },
      {
        displayName: 'Album Position',
        name: 'albumPosition',
        type: 'options',
        options: [
          { name: 'First in Album', value: 'FIRST_IN_ALBUM' },
          { name: 'Last in Album',  value: 'LAST_IN_ALBUM'  },
        ],
        default: 'LAST_IN_ALBUM',
        displayOptions: { show: { resource: ['album'], operation: ['addEnrichment'] } },
      },

      // ── Album: Set Cover ──────────────────────────────────────────────────
      {
        displayName: 'Cover Media Item ID',
        name: 'coverMediaItemId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: { show: { resource: ['album'], operation: ['setCover'] } },
        description: 'ID of the media item to use as the album cover photo',
      },

      // ── Picker: Create Session Options ────────────────────────────────────
      {
        displayName: 'Max Item Count',
        name: 'maxItemCount',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 500 },
        default: 100,
        displayOptions: {
          show: { resource: ['picker'], operation: ['createSession'] },
        },
        description: 'Maximum number of items the user can select in this picker session (1–500)',
      },
      {
        displayName: 'Media Type Filter',
        name: 'pickerMediaTypeFilter',
        type: 'options',
        options: [
          { name: 'All Media',   value: 'ALL_MEDIA' },
          { name: 'Photos Only', value: 'PHOTO'     },
          { name: 'Videos Only', value: 'VIDEO'     },
        ],
        default: 'ALL_MEDIA',
        displayOptions: {
          show: { resource: ['picker'], operation: ['createSession'] },
        },
        description: 'Filter the types of media items available for selection in the Picker UI',
      },

      // ── Picker: Session ID ─────────────────────────────────────────────────
      {
        displayName: 'Session ID',
        name: 'sessionId',
        type: 'string',
        required: true,
        default: '',
        displayOptions: {
          show: { resource: ['picker'], operation: ['getSession', 'listSessionItems', 'deleteSession'] },
        },
        description: 'The session ID returned by the Create Session operation',
      },

      // ── Pagination ─────────────────────────────────────────────────────────
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: { operation: ['list', 'search', 'listSessionItems'] },
        },
        description: 'Whether to return all results or only up to a given limit',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 50,
        displayOptions: {
          show: { operation: ['list', 'search', 'listSessionItems'], returnAll: [false] },
        },
        description: 'Max number of results to return (1–100)',
      },

    ],
  };

  // ─── Execute ───────────────────────────────────────────────────────────────

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items  = this.getInputData();
    const output: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const resource  = this.getNodeParameter('resource',  i) as string;
        const operation = this.getNodeParameter('operation', i) as string;

        let result: IDataObject | IDataObject[];

        // ── Media Item operations ────────────────────────────────────────────
        if (resource === 'mediaItem') {

          if (operation === 'get') {
            const id = this.getNodeParameter('mediaItemId', i) as string;
            result = await apiRequest.call(this, 'GET', `${LIBRARY}/mediaItems/${encodeURIComponent(id)}`);

          } else if (operation === 'list') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit     = this.getNodeParameter('limit', i, 50) as number;
            result = await apiRequestAllItems.call(this, 'GET', `${LIBRARY}/mediaItems`, 'mediaItems', {}, {}, returnAll, limit);

          } else if (operation === 'search') {
            const returnAll     = this.getNodeParameter('returnAll',     i)     as boolean;
            const limit         = this.getNodeParameter('limit',         i, 50) as number;
            const searchAlbumId = this.getNodeParameter('searchAlbumId', i, '') as string;
            const filters       = this.getNodeParameter('filters',       i, {}) as IDataObject;

            const body: IDataObject = {};

            if (searchAlbumId) {
              body.albumId = searchAlbumId;
            } else {
              const filterObj: IDataObject = {};

              if (filters.mediaTypeFilter && filters.mediaTypeFilter !== 'ALL_MEDIA') {
                filterObj.mediaTypeFilter = { mediaTypes: [filters.mediaTypeFilter] };
              }
              if (filters.startDate || filters.endDate) {
                const range: IDataObject = {};
                if (filters.startDate) range.startDate = isoToGDate(filters.startDate as string);
                if (filters.endDate)   range.endDate   = isoToGDate(filters.endDate   as string);
                filterObj.dateFilter = { ranges: [range] };
              }
              if (filters.includeArchivedMedia) {
                filterObj.includeArchivedMedia = true;
              }
              if (Object.keys(filterObj).length) body.filters = filterObj;
            }

            result = await apiRequestAllItems.call(this, 'POST', `${LIBRARY}/mediaItems:search`, 'mediaItems', body, {}, returnAll, limit);

          } else if (operation === 'upload') {
            const binaryProp     = this.getNodeParameter('binaryPropertyName', i)     as string;
            const description    = this.getNodeParameter('uploadDescription',   i, '') as string;
            const uploadAlbumId  = this.getNodeParameter('uploadAlbumId',       i, '') as string;

            const binaryData = this.helpers.assertBinaryData(i, binaryProp);
            const dataBuffer = await this.helpers.getBinaryDataBuffer(i, binaryProp);
            const fileName   = (this.getNodeParameter('uploadFileName', i, '') as string)
              || binaryData.fileName
              || 'upload';
            const mimeType   = binaryData.mimeType || 'application/octet-stream';

            // Step 1 — raw binary upload → uploadToken (plain-text response)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uploadToken = await (this.helpers.requestWithAuthentication as any).call(this, CRED, {
              method: 'POST',
              url: `${LIBRARY}/uploads`,
              headers: {
                'Content-Type': 'application/octet-stream',
                'X-Goog-Upload-Content-Type': mimeType,
                'X-Goog-Upload-Protocol': 'raw',
                'X-Goog-Upload-File-Name': fileName,
              },
              body: dataBuffer,
            }) as string;

            // Step 2 — create the media item from the upload token
            const createBody: IDataObject = {
              newMediaItems: [{
                ...(description ? { description } : {}),
                simpleMediaItem: { uploadToken, fileName },
              }],
              ...(uploadAlbumId ? { albumId: uploadAlbumId } : {}),
            };
            result = await apiRequest.call(this, 'POST', `${LIBRARY}/mediaItems:batchCreate`, createBody);

          } else {
            throw new NodeOperationError(this.getNode(), `Unknown mediaItem operation: ${operation}`, { itemIndex: i });
          }

        // ── Album operations ─────────────────────────────────────────────────
        } else if (resource === 'album') {

          if (operation === 'get') {
            const albumId = this.getNodeParameter('albumId', i) as string;
            result = await apiRequest.call(this, 'GET', `${LIBRARY}/albums/${encodeURIComponent(albumId)}`);

          } else if (operation === 'list') {
            const returnAll = this.getNodeParameter('returnAll', i)     as boolean;
            const limit     = this.getNodeParameter('limit',     i, 50) as number;
            result = await apiRequestAllItems.call(this, 'GET', `${LIBRARY}/albums`, 'albums', {}, {}, returnAll, limit);

          } else if (operation === 'create') {
            const title = this.getNodeParameter('title', i) as string;
            result = await apiRequest.call(this, 'POST', `${LIBRARY}/albums`, { album: { title } });

          } else if (operation === 'addItems') {
            const albumId = this.getNodeParameter('albumId', i) as string;
            const ids     = (this.getNodeParameter('mediaItemIds', i) as string)
              .split(',').map(s => s.trim()).filter(Boolean);

            // Google API allows max 50 items per call — chunk automatically
            const chunkSize = 50;
            const responses: IDataObject[] = [];
            for (let c = 0; c < ids.length; c += chunkSize) {
              const chunk = ids.slice(c, c + chunkSize);
              const batchRes = await apiRequest.call(
                this, 'POST',
                `${LIBRARY}/albums/${encodeURIComponent(albumId)}:batchAddMediaItems`,
                { mediaItemIds: chunk },
              );
              responses.push(batchRes);
            }
            result = responses.length === 1 ? responses[0] : responses;

          } else if (operation === 'addEnrichment') {
            const albumId       = this.getNodeParameter('albumId',       i) as string;
            const enrichType    = this.getNodeParameter('enrichmentType', i) as string;
            const albumPosition = this.getNodeParameter('albumPosition',  i) as string;

            let newEnrichmentItem: IDataObject;
            if (enrichType === 'text') {
              const text = this.getNodeParameter('enrichmentText', i) as string;
              newEnrichmentItem = { textEnrichment: { text } };
            } else {
              const locationName = this.getNodeParameter('locationName', i) as string;
              const latitude     = this.getNodeParameter('latitude',     i) as number;
              const longitude    = this.getNodeParameter('longitude',    i) as number;
              newEnrichmentItem = {
                locationEnrichment: {
                  location: { locationName, latlng: { latitude, longitude } },
                },
              };
            }

            result = await apiRequest.call(
              this, 'POST',
              `${LIBRARY}/albums/${encodeURIComponent(albumId)}:addEnrichment`,
              { newEnrichmentItem, albumPosition: { position: albumPosition } },
            );

          } else if (operation === 'setCover') {
            const albumId          = this.getNodeParameter('albumId',          i) as string;
            const coverMediaItemId = this.getNodeParameter('coverMediaItemId', i) as string;
            result = await apiRequest.call(
              this, 'PATCH',
              `${LIBRARY}/albums/${encodeURIComponent(albumId)}`,
              { coverPhotoMediaItemId: coverMediaItemId },
              { updateMask: 'coverPhotoMediaItemId' },
            );

          } else {
            throw new NodeOperationError(this.getNode(), `Unknown album operation: ${operation}`, { itemIndex: i });
          }

        // ── Picker operations ────────────────────────────────────────────────
        } else if (resource === 'picker') {

          if (operation === 'createSession') {
            const maxItemCount = this.getNodeParameter('maxItemCount', i, 100) as number;
            const mediaType    = this.getNodeParameter('pickerMediaTypeFilter', i, 'ALL_MEDIA') as string;

            const pickingConfig: IDataObject = {};
            if (maxItemCount > 0) {
              pickingConfig.maxItemCount = maxItemCount;
            }
            if (mediaType === 'PHOTO') {
              pickingConfig.mimeTypeFilter = ['IMAGE_ALL'];
            } else if (mediaType === 'VIDEO') {
              pickingConfig.mimeTypeFilter = ['VIDEO_ALL'];
            }

            const body: IDataObject = {};
            if (Object.keys(pickingConfig).length > 0) {
              body.pickingConfig = pickingConfig;
            }

            result = await apiRequest.call(this, 'POST', `${PICKER}/sessions`, body);

          } else if (operation === 'getSession') {
            const sessionId = this.getNodeParameter('sessionId', i) as string;
            result = await apiRequest.call(this, 'GET', `${PICKER}/sessions/${encodeURIComponent(sessionId)}`);

          } else if (operation === 'deleteSession') {
            const sessionId = this.getNodeParameter('sessionId', i) as string;
            result = await apiRequest.call(this, 'DELETE', `${PICKER}/sessions/${encodeURIComponent(sessionId)}`);

          } else if (operation === 'listSessionItems') {
            const sessionId = this.getNodeParameter('sessionId', i) as string;
            const returnAll = this.getNodeParameter('returnAll', i)     as boolean;
            const limit     = this.getNodeParameter('limit',     i, 50) as number;
            result = await apiRequestAllItems.call(
              this, 'GET', `${PICKER}/mediaItems`, 'mediaItems',
              {}, { sessionId }, returnAll, limit,
            );

          } else {
            throw new NodeOperationError(this.getNode(), `Unknown picker operation: ${operation}`, { itemIndex: i });
          }

        } else {
          throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
        }

        // Push result(s) to output
        if (Array.isArray(result)) {
          result.forEach(r => output.push({ json: r, pairedItem: { item: i } }));
        } else {
          output.push({ json: result, pairedItem: { item: i } });
        }

      } catch (error: any) {
        let errMsg = error?.response?.data?.error?.message || (error instanceof Error ? error.message : String(error));

        // Help user identify scope issues on Picker API
        const resource = (this.getNodeParameter('resource', i, '') as string);
        if (resource === 'picker' && (errMsg.includes('403') || errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('scope'))) {
          errMsg += ' — Note: If this is an authorization error, reconnect your Google OAuth2 API credential in n8n and ensure it includes the scope "https://www.googleapis.com/auth/photospicker.mediaitems.readonly". Existing credential metadata cannot confirm whether that scope was granted.';
        }

        if (this.continueOnFail()) {
          output.push({
            json: { error: errMsg },
            pairedItem: { item: i },
          });
        } else {
          if (error instanceof NodeOperationError) throw error;
          throw new NodeOperationError(
            this.getNode(),
            new Error(errMsg),
            { itemIndex: i },
          );
        }
      }
    }

    return [output];
  }
}
