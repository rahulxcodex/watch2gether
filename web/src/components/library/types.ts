export interface LibraryTitle {
  id: string;
  name: string;
  mediaType: "movie" | "series";
  year?: number | null;
  imdbId?: string | null;
  imdbUrl?: string | null;
  imdbRating?: number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  summary?: string;
  genres?: string[];
  episodes: LibraryEpisode[];
  updatedAt?: number;
}

export interface LibraryEpisode {
  id: string;
  title: string;
  url: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeCode?: string;
  episodeImdbId?: string | null;
  episodeSummary?: string;
  subtitleUrl?: string;
  subtitleFileName?: string;
  subtitleText?: string;
}
