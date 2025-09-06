import logging
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urlparse
from pytidb import TiDBClient

from config import settings

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for managing TiDB database connections."""
    
    def __init__(self):
        self._client: Optional[TiDBClient] = None
        self._is_hybrid_search_available: Optional[bool] = None
    
    def _parse_database_url(self) -> Dict[str, Any]:
        """Parse DATABASE_URL into connection parameters."""
        if not settings.database_url:
            raise ValueError("DATABASE_URL not configured")
        
        # Parse URL like: mysql://user:password@host:port/database
        parsed = urlparse(settings.database_url)
        
        # Extract username and password
        username = parsed.username or ''
        password = parsed.password or ''
        
        # Handle TiDB Cloud format: <cluster_id>.root
        if '.' in username:
            # Keep the full username as is for TiDB Cloud
            pass
        
        return {
            'host': parsed.hostname or 'localhost',
            'port': parsed.port or 4000,
            'user': username,
            'password': password,
            'database': parsed.path.lstrip('/') if parsed.path else 'test',
        }
    
    def connect(self) -> TiDBClient:
        """Create or return existing database connection."""
        if self._client:
            return self._client
        
        try:
            conn_params = self._parse_database_url()
            logger.info(f"Connecting to TiDB at {conn_params['host']}:{conn_params['port']}")
            
            self._client = TiDBClient.connect(
                host=conn_params['host'],
                port=conn_params['port'],
                username=conn_params['user'],
                password=conn_params['password'],
                database=conn_params['database'],
                # PyMySQL timeout parameters via SQLAlchemy connect_args
                connect_args={
                    'connect_timeout': 30,  # 30 seconds for initial connection
                    'read_timeout': 60,     # 60 seconds for read operations (vector queries can be slow)
                    'write_timeout': 60     # 60 seconds for write operations
                }
            )
            
            logger.info("Successfully connected to TiDB")
            return self._client
            
        except Exception as e:
            logger.error(f"Failed to connect to TiDB: {e}")
            raise
    
    def check_hybrid_search_available(self) -> bool:
        """Check if TiDB hybrid search functionality is available."""
        if self._is_hybrid_search_available is not None:
            return self._is_hybrid_search_available
        
        try:
            client = self.connect()
            
            # First, test basic connectivity
            logger.info("Testing basic TiDB connectivity...")
            basic_result = client.query("SELECT 1 as test").scalar()
            logger.info(f"Basic connectivity test result: {basic_result}")
            
            # Check TiDB version
            try:
                version_result = client.query("SELECT VERSION()").scalar()
                logger.info(f"TiDB version: {version_result}")
            except Exception as ve:
                logger.warning(f"Could not get TiDB version: {ve}")
            
            # Check if vector functions are available
            logger.info("Testing vector function availability...")
            
            # Try different approaches to check vector support
            try:
                # Approach 1: Direct query with scalar
                result = client.query("SELECT VEC_COSINE_DISTANCE('[1,2,3]', '[1,2,3]')").scalar()
                logger.info(f"Vector function test result: {result}")
            except Exception as e1:
                logger.error(f"Approach 1 failed: {e1}")
                
                # Approach 2: Try with explicit AS clause
                try:
                    result = client.query("SELECT VEC_COSINE_DISTANCE('[1,2,3]', '[1,2,3]') AS distance").scalar()
                    logger.info(f"Vector function test with AS clause result: {result}")
                except Exception as e2:
                    logger.error(f"Approach 2 failed: {e2}")
                    
                    # Approach 3: Try without scalar()
                    try:
                        result = client.query("SELECT VEC_COSINE_DISTANCE('[1,2,3]', '[1,2,3]') AS distance")
                        logger.info(f"Vector function raw result type: {type(result)}")
                        logger.info(f"Vector function raw result: {result}")
                        # Try to get value from result
                        if hasattr(result, 'fetchone'):
                            row = result.fetchone()
                            logger.info(f"Fetched row: {row}")
                    except Exception as e3:
                        logger.error(f"Approach 3 failed: {e3}")
                        raise  # Re-raise the last exception
            
            # If we can execute vector functions, hybrid search is available
            self._is_hybrid_search_available = True
            logger.info("TiDB hybrid search is available")
            
        except Exception as e:
            logger.error(f"TiDB hybrid search check failed: {type(e).__name__}: {e}")
            logger.error(f"Full error details: {repr(e)}")
            self._is_hybrid_search_available = False
        
        return self._is_hybrid_search_available
    
    def execute_query(self, query: str, params: Optional[Tuple] = None) -> List[Dict[str, Any]]:
        """Execute a query and return results as list of dicts."""
        client = self.connect()
        
        try:
            # Log the query for debugging
            logger.debug(f"Executing query: {query}")
            
            # PyTiDB's query method returns results directly
            # For parameterized queries, we need to format the query
            if params:
                # Replace %s placeholders with actual values
                # Note: This is a simplified approach - in production, use proper parameterization
                formatted_query = query
                for param in params:
                    # For JSON arrays (vectors), need to wrap in quotes for TiDB
                    if isinstance(param, str) and param.startswith('[') and param.endswith(']'):
                        # This is likely a vector - wrap it in single quotes
                        # TiDB expects vector literals as quoted strings
                        formatted_query = formatted_query.replace('%s', f"'{param}'", 1)
                    else:
                        # For other types, use repr() for proper escaping
                        formatted_query = formatted_query.replace('%s', repr(param), 1)
                logger.debug(f"Formatted query: {formatted_query[:500]}...")  # Log first 500 chars
                result = client.query(formatted_query)
            else:
                result = client.query(query)
            
            logger.debug(f"Query result type: {type(result)}")
            
            # Convert result to list of dicts
            # PyTiDB returns a list directly
            rows = []
            
            # Handle PyTiDB SQLQueryResult
            if hasattr(result, 'to_list'):
                # PyTiDB SQLQueryResult has a to_list() method
                rows = result.to_list()
                logger.debug(f"Got {len(rows)} rows from result.to_list()")
            elif hasattr(result, 'rows'):
                # PyTiDB SQLQueryResult might have a 'rows' attribute
                rows = result.rows
                logger.debug(f"Got {len(rows)} rows from result.rows")
            elif hasattr(result, 'all'):
                # Result object with all() method
                rows = result.all()
                logger.debug(f"Got {len(rows)} rows from result.all()")
            elif isinstance(result, list):
                rows = result
                logger.debug(f"Got list result with {len(rows)} rows")
            else:
                # Fallback
                logger.warning(f"Unexpected result type: {type(result)}")
                rows = []
            
            logger.debug(f"Returning {len(rows)} rows")
            if rows and len(rows) > 0:
                logger.debug(f"First row sample: {rows[0]}")
            return rows
            
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            logger.error(f"Query was: {query}")
            raise
    
    def close(self):
        """Close the database connection."""
        if self._client:
            # TiDBClient may not have a close method, but we can reset the reference
            self._client = None


# Global database service instance
db_service = DatabaseService()