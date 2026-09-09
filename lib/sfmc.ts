import { XMLParser } from "fast-xml-parser";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  rest_instance_url?: string;
  soap_instance_url?: string;
}

interface CachedToken extends TokenResponse {
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value.replace(/\/$/, "");
}

export function getConfigurationStatus() {
  return {
    clientIdConfigured: Boolean(process.env.SFMC_CLIENT_ID),
    clientSecretConfigured: Boolean(process.env.SFMC_CLIENT_SECRET),
    accountIdConfigured: Boolean(process.env.SFMC_ACCOUNT_ID),
    authBaseUriConfigured: Boolean(process.env.SFMC_AUTH_BASE_URI),
    restBaseUriConfigured: Boolean(process.env.SFMC_REST_BASE_URI),
    soapBaseUriConfigured: Boolean(process.env.SFMC_SOAP_BASE_URI),
    gatewayTokenConfigured: Boolean(process.env.MCP_GATEWAY_TOKEN),
  };
}

export async function getAccessToken(): Promise<CachedToken> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache;

  const response = await fetch(`${required("SFMC_AUTH_BASE_URI")}/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: required("SFMC_CLIENT_ID"),
      client_secret: required("SFMC_CLIENT_SECRET"),
      account_id: Number(required("SFMC_ACCOUNT_ID")),
    }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SFMC token request failed (${response.status}): ${text.slice(0, 1000)}`);
  }

  const token = JSON.parse(text) as TokenResponse;
  tokenCache = {
    ...token,
    expiresAt: Date.now() + Math.max(60, token.expires_in - 90) * 1000,
  };
  return tokenCache;
}

function restBase(token: CachedToken): string {
  return (token.rest_instance_url || required("SFMC_REST_BASE_URI")).replace(/\/$/, "");
}

function soapBase(token: CachedToken): string {
  return (token.soap_instance_url || required("SFMC_SOAP_BASE_URI")).replace(/\/$/, "");
}

export async function sfmcRest(path: string) {
  const token = await getAccessToken();
  const response = await fetch(`${restBase(token)}${path}`, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SFMC REST ${path} failed (${response.status}): ${text.slice(0, 1500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function findKey(node: unknown, target: string): any {
  if (!node || typeof node !== "object") return undefined;
  if (target in (node as Record<string, unknown>)) {
    return (node as Record<string, unknown>)[target];
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findKey(value, target);
    if (found !== undefined) return found;
  }
  return undefined;
}

export async function soapRetrieve(
  objectType: string,
  properties: string[],
  filter?: { property: string; value: string },
) {
  const token = await getAccessToken();
  const filterXml = filter
    ? `<Filter xsi:type="SimpleFilterPart"><Property>${xmlEscape(filter.property)}</Property><SimpleOperator>equals</SimpleOperator><Value>${xmlEscape(filter.value)}</Value></Filter>`
    : "";

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header>
    <fueloauth xmlns="http://exacttarget.com">${xmlEscape(token.access_token)}</fueloauth>
  </soap:Header>
  <soap:Body>
    <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <RetrieveRequest>
        <ObjectType>${xmlEscape(objectType)}</ObjectType>
        ${properties.map((p) => `<Properties>${xmlEscape(p)}</Properties>`).join("")}
        ${filterXml}
      </RetrieveRequest>
    </RetrieveRequestMsg>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(`${soapBase(token)}/Service.asmx`, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      SOAPAction: "Retrieve",
    },
    body: envelope,
    cache: "no-store",
  });

  const xml = await response.text();
  if (!response.ok) {
    throw new Error(`SFMC SOAP retrieve ${objectType} failed (${response.status}): ${xml.slice(0, 1500)}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: true,
  });
  const parsed = parser.parse(xml);

  const fault = findKey(parsed, "Fault");
  if (fault) {
    throw new Error(`SFMC SOAP fault: ${JSON.stringify(fault).slice(0, 1500)}`);
  }

  const msg = findKey(parsed, "RetrieveResponseMsg");
  const raw = msg?.Results;
  return {
    overallStatus: msg?.OverallStatus,
    requestId: msg?.RequestID,
    results: raw == null ? [] : Array.isArray(raw) ? raw : [raw],
  };
}

export async function listJourneys(page = 1, pageSize = 20) {
  return sfmcRest(
    `/interaction/v1/interactions?$page=${Math.max(1, page)}&$pageSize=${Math.min(50, Math.max(1, pageSize))}`,
  );
}

export async function getJourney(id: string) {
  return sfmcRest(`/interaction/v1/interactions/${encodeURIComponent(id)}`);
}

export async function listDataExtensions(limit = 50) {
  const data = await soapRetrieve("DataExtension", [
    "ObjectID",
    "CustomerKey",
    "Name",
    "Description",
    "CategoryID",
    "IsSendable",
    "IsTestable",
    "CreatedDate",
    "ModifiedDate",
  ]);
  return {
    ...data,
    results: data.results.slice(0, Math.min(200, Math.max(1, limit))),
  };
}

export async function getDataExtensionFields(customerKey: string) {
  return soapRetrieve(
    "DataExtensionField",
    [
      "ObjectID",
      "Name",
      "FieldType",
      "MaxLength",
      "IsPrimaryKey",
      "IsRequired",
      "Ordinal",
      "DefaultValue",
    ],
    { property: "DataExtension.CustomerKey", value: customerKey },
  );
}

export async function listAutomations(limit = 50) {
  const data = await soapRetrieve("Automation", [
    "ObjectID",
    "CustomerKey",
    "Name",
    "Description",
    "Status",
    "AutomationType",
    "IsActive",
    "CreatedDate",
    "ModifiedDate",
  ]);
  return {
    ...data,
    results: data.results.slice(0, Math.min(200, Math.max(1, limit))),
  };
}
