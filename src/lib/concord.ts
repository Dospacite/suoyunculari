export type ConcordAuthor = {
  id?: number | string;
  name: string;
  slug?: string;
  source_url?: string;
};

export type ConcordPlay = {
  source?: string;
  source_id: string;
  source_url?: string;
  scraped_at?: string;
  title: string;
  slug: string;
  summary_text?: string;
  summary_html?: string;
  full_description_html?: string;
  authors?: ConcordAuthor[];
  play_type?: string;
  genres?: string[];
  subgenres?: string[];
  duration_text?: string;
  duration_minutes?: number;
  casting_text?: string;
  min_cast_size?: number;
  max_cast_size?: number;
  female_roles?: number;
  male_roles?: number;
  neutral_roles?: number;
  setting_html?: string;
  themes?: string[];
  target_audience?: string;
  performance_groups?: string[];
  features?: string[];
  cautions?: string[];
  tags?: string[];
  rights_status?: 'licensed';
  licensing_fee_text?: string;
  imprint?: string;
  isbn?: string;
  sample_pdf_urls?: string[];
  image_urls?: string[];
};

export type ConcordSearchResult = {
  items: ConcordPlay[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  genres: string[];
  databaseReady: boolean;
};
