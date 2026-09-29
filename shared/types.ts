export type TherapistCard = {
  slug: string;
  name: string;
  initials: string;
  photoUrl?: string;
  location?: string;
  distance?: string;
  sessionTypes?: string;
  summary?: string;
  tags: string[];
};

export type SearchResult = {
  total: number;
  from: number;
  to: number;
  locationSearched?: string;
  notices: string[];
  therapists: TherapistCard[];
};

export type ProfileSection = {
  heading: string;
  paragraphs: string[];
  items: string[];
  details: { title: string; text: string }[];
};

export type Office = {
  name: string;
  isMain: boolean;
  address: string[];
  mapUrl?: string;
  cost?: string;
};

export type Profile = {
  slug: string;
  name: string;
  initials: string;
  photoUrl?: string;
  location?: string;
  languages: string[];
  email?: string;
  contactId?: string;
  /** Links from the header's social media icons. */
  social: string[];
  about: ProfileSection[];
  practical: ProfileSection[];
  offices: Office[];
};

export type ContactDetails = { phone?: string; email?: string; website?: string };

export type FilterField = { name: string; value: string; label: string };
export type FilterGroup = { label: string; help?: string; fields: FilterField[] };
export type Options = { helpWith: string[]; groups: FilterGroup[] };
