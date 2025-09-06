import { useState, useEffect, useRef } from 'react';
import { FiSearch } from 'react-icons/fi';
import { SearchApiResponse, SearchResultItem } from 'shared-types';
import { useDebounce } from '../hooks/useDebounce';
import api from '../lib/api-client';
import SearchResults from './SearchResults';

export default function Search() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  const debouncedQuery = useDebounce(query, 300);

  // Execute search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('Performing search for:', debouncedQuery);
        const response = await api.search(debouncedQuery, 10);
        console.log('Search response:', response.data);
        setResults(response.data.data.results);
        console.log('Search results set:', response.data.data.results);
      } catch (err) {
        console.error('Search error:', err);
        setError('Failed to search. Please try again.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search messages and answers..."
          className="input input-bordered w-full pl-10 pr-4 py-2 glass bg-base-100/10 border border-base-content/30 placeholder:text-base-content/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-base-100/20 transition-all"
          aria-label="Search"
        />
        <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/80" size={18} />
      </div>

      {/* Search Results Dropdown */}
      {isOpen && query.length >= 2 && (
        console.log('Dropdown should render:', { isOpen, queryLength: query.length, loading, resultsLength: results.length }),
        <div className="absolute top-full left-0 right-0 mt-2 bg-base-100 border border-primary/20 rounded-lg shadow-xl glass glass-strong max-h-96 overflow-y-auto z-50 min-w-[350px]">
          {loading ? (
            <div className="p-4 text-center">
              <span className="loading loading-spinner loading-sm text-primary"></span>
              <p className="text-sm text-base-content/60 mt-2">Searching...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-sm text-error">{error}</p>
            </div>
          ) : results.length > 0 ? (
            <SearchResults results={results} onClose={() => setIsOpen(false)} />
          ) : debouncedQuery.length >= 2 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-base-content/60">No results found for &ldquo;{debouncedQuery}&rdquo;</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}