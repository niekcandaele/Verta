import logging
from typing import List, Dict, Any, Optional
import json

from services.database import db_service

logger = logging.getLogger(__name__)


class SearchService:
    """Service for executing hybrid search queries against TiDB."""
    
    def search_table(
        self, 
        table: str,
        text_field: str,
        vector_field: str,
        embedding: List[float],
        filters: Dict[str, Any],
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Execute hybrid search on a single table.
        
        Args:
            table: Table name to search
            text_field: Column name for text content
            vector_field: Column name for vector embeddings
            embedding: Query embedding vector
            filters: Additional WHERE clause filters
            limit: Maximum number of results
            
        Returns:
            List of search results with distance scores
        """
        # Convert embedding to JSON string for TiDB
        embedding_json = json.dumps(embedding)
        
        # Build WHERE clause from filters
        where_clauses = []
        params = []
        
        for key, value in filters.items():
            # Add table prefix for ambiguous columns
            if table == "golden_answers" and key in ["tenant_id"]:
                where_clauses.append(f"ga.{key} = %s")
            else:
                where_clauses.append(f"{key} = %s")
            params.append(value)
        
        where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Build query based on table type
        if table == "golden_answers":
            query = f"""
            SELECT 
                ga.id,
                qc.representative_text as question,
                ga.answer as content,
                ga.tenant_id,
                VEC_COSINE_DISTANCE(ga.{vector_field}, %s) as distance,
                1.0 - VEC_COSINE_DISTANCE(ga.{vector_field}, %s) as similarity_score
            FROM {table} ga
            JOIN question_clusters qc ON ga.cluster_id = qc.id
            WHERE ga.{vector_field} IS NOT NULL
                AND {where_clause}
            ORDER BY distance ASC
            LIMIT %s
            """
            # Add embedding twice (for distance and similarity calculations)
            params = [embedding_json, embedding_json] + params + [limit]
            
        elif table == "messages":
            # Need to join with channels to get tenant_id
            # Update where clause to reference channels table
            if "tenant_id" in filters:
                tenant_filter = "c.tenant_id = %s"
                tenant_id = filters.pop("tenant_id")
                other_filters = []
                for key, value in filters.items():
                    other_filters.append(f"m.{key} = %s")
                where_clause = tenant_filter
                if other_filters:
                    where_clause += " AND " + " AND ".join(other_filters)
                # Rebuild params with tenant_id first
                params = [tenant_id] + list(filters.values())
            else:
                # No tenant filter, use original where clause with m. prefix
                where_clauses = []
                params = []
                for key, value in filters.items():
                    where_clauses.append(f"m.{key} = %s")
                    params.append(value)
                where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
            
            query = f"""
            SELECT 
                m.id,
                m.content,
                m.channel_id,
                m.anonymized_author_id,
                m.platform_created_at,
                VEC_COSINE_DISTANCE(m.{vector_field}, %s) as distance,
                1.0 - VEC_COSINE_DISTANCE(m.{vector_field}, %s) as similarity_score
            FROM {table} m
            JOIN channels c ON m.channel_id = c.id
            WHERE m.{vector_field} IS NOT NULL
                AND {where_clause}
            ORDER BY distance ASC
            LIMIT %s
            """
            # Add embedding twice (for distance and similarity calculations)
            params = [embedding_json, embedding_json] + params + [limit]
        
        else:
            raise ValueError(f"Unsupported table: {table}")
        
        try:
            results = db_service.execute_query(query, tuple(params))
            logger.info(f"Found {len(results)} results from {table}")
            return results
            
        except Exception as e:
            logger.error(f"Search query failed for {table}: {e}")
            raise
    
    def search_all(
        self,
        search_configs: List[Dict[str, Any]],
        embedding: List[float],
        limit_per_source: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Execute searches across multiple tables and combine results.
        
        Args:
            search_configs: List of search configurations
            embedding: Query embedding vector
            limit_per_source: Max results per table
            
        Returns:
            Combined list of search results
        """
        all_results = []
        
        for config in search_configs:
            results = self.search_table(
                table=config['table'],
                text_field=config['text_field'],
                vector_field=config['vector_field'],
                embedding=embedding,
                filters=config['filters'],
                limit=limit_per_source
            )
            
            # Add source information
            for result in results:
                result['source_table'] = config['table']
                
            all_results.extend(results)
        
        # Sort combined results by similarity score
        all_results.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
        
        return all_results
    
    def format_search_results(
        self,
        results: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Format raw search results for API response.
        
        Args:
            results: Raw search results from database
            
        Returns:
            Formatted results with proper types and excerpts
        """
        formatted = []
        
        for result in results:
            # Skip results without similarity_score (failed queries)
            if 'similarity_score' not in result:
                logger.warning(f"Skipping result without similarity_score: {result.get('source_table', 'unknown')}")
                continue
                
            if result['source_table'] == 'golden_answers':
                formatted.append({
                    'type': 'golden_answer',
                    'score': float(result['similarity_score']),
                    'content': result['content'],
                    'metadata': {
                        'id': str(result['id']),
                        'question': result['question'],
                        'tenant_id': result['tenant_id']
                    }
                })
                
            elif result['source_table'] == 'messages':
                # Create excerpt (first 200 characters)
                content = result['content'] or ''
                excerpt = content[:200] + '...' if len(content) > 200 else content
                
                formatted.append({
                    'type': 'message',
                    'score': float(result['similarity_score']),
                    'excerpt': excerpt,
                    'message_id': str(result['id']),
                    'metadata': {
                        'channel_id': result['channel_id'],
                        'author_id': result['anonymized_author_id'],
                        'created_at': result['platform_created_at'].isoformat() if result['platform_created_at'] else None
                    }
                })
        
        return formatted


# Global search service instance
search_service = SearchService()