// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Kategorien {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    kategorie_name?: string;
    kategorie_beschreibung?: string;
  };
}

export interface Orte {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    ort_name?: string;
    kategorie?: string; // applookup -> URL zu 'Kategorien' Record
    strasse?: string;
    hausnummer?: string;
    postleitzahl?: string;
    stadt?: string;
    land?: string;
    standort?: GeoLocation; // { lat, long, info }
    website?: string;
    telefon?: string;
    oeffnungszeiten?: string;
    beschreibung?: string;
    fotos?: string;
    bewertung?: LookupValue;
    bereits_besucht?: boolean;
    besuchsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    notizen_nach_besuch?: string;
  };
}

export const APP_IDS = {
  KATEGORIEN: '69d19fcaf3bbc58ce0bfda94',
  ORTE: '69d19fcd22b3c4519dd04ce3',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'orte': {
    bewertung: [{ key: "rating_1", label: "⭐ 1 – Weniger beeindruckend" }, { key: "rating_2", label: "⭐⭐ 2 – Ganz okay" }, { key: "rating_3", label: "⭐⭐⭐ 3 – Gut" }, { key: "rating_4", label: "⭐⭐⭐⭐ 4 – Sehr gut" }, { key: "rating_5", label: "⭐⭐⭐⭐⭐ 5 – Absolut empfehlenswert" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'kategorien': {
    'kategorie_name': 'string/text',
    'kategorie_beschreibung': 'string/textarea',
  },
  'orte': {
    'ort_name': 'string/text',
    'kategorie': 'applookup/select',
    'strasse': 'string/text',
    'hausnummer': 'string/text',
    'postleitzahl': 'string/text',
    'stadt': 'string/text',
    'land': 'string/text',
    'standort': 'geo',
    'website': 'string/url',
    'telefon': 'string/tel',
    'oeffnungszeiten': 'string/text',
    'beschreibung': 'string/textarea',
    'fotos': 'file',
    'bewertung': 'lookup/radio',
    'bereits_besucht': 'bool',
    'besuchsdatum': 'date/date',
    'notizen_nach_besuch': 'string/textarea',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateKategorien = StripLookup<Kategorien['fields']>;
export type CreateOrte = StripLookup<Orte['fields']>;