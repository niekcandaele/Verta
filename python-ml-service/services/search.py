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
                ga.cluster_id,
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
                m.platform_message_id,
                c.slug as channel_slug,
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
            
        elif table == "knowledge_base_chunks":
            # Need to join with knowledge_bases to get tenant_id and kb name
            # Handle tenant_id filter through knowledge_bases table
            if "knowledge_bases.tenant_id" in filters:
                tenant_filter = "kb.tenant_id = %s"
                tenant_id = filters.pop("knowledge_bases.tenant_id")
                other_filters = []
                for key, value in filters.items():
                    if key.startswith("knowledge_bases."):
                        other_filters.append(f"kb.{key.replace('knowledge_bases.', '')} = %s")
                    else:
                        other_filters.append(f"kbc.{key} = %s")
                where_clause = tenant_filter
                if other_filters:
                    where_clause += " AND " + " AND ".join(other_filters)
                # Rebuild params with tenant_id first
                params = [tenant_id] + list(filters.values())
            else:
                # No tenant filter, use original where clause with kbc. prefix
                where_clauses = []
                params = []
                for key, value in filters.items():
                    if key.startswith("knowledge_bases."):
                        where_clauses.append(f"kb.{key.replace('knowledge_bases.', '')} = %s")
                    else:
                        where_clauses.append(f"kbc.{key} = %s")
                    params.append(value)
                where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
            
            query = f"""
            SELECT 
                kbc.id,
                kbc.content,
                kbc.title,
                kbc.source_url,
                kbc.chunk_index,
                kbc.total_chunks,
                kbc.heading_hierarchy,
                kbc.knowledge_base_id,
                kb.name as kb_name,
                kb.tenant_id,
                VEC_COSINE_DISTANCE(kbc.{vector_field}, %s) as distance,
                1.0 - VEC_COSINE_DISTANCE(kbc.{vector_field}, %s) as similarity_score
            FROM {table} kbc
            JOIN knowledge_bases kb ON kbc.knowledge_base_id = kb.id
            WHERE kbc.{vector_field} IS NOT NULL
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
    
    async def search_all(
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
        import asyncio
        import concurrent.futures
        
        # Create a shared thread pool executor for all searches
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            # Create tasks for parallel execution
            async def search_table_async(config):
                table_name = config['table']
                logger.info(f"Starting search for table: {table_name}")
                start_time = asyncio.get_event_loop().time()
                
                results = await loop.run_in_executor(
                    executor,
                    self.search_table,
                    config['table'],
                    config['text_field'],
                    config['vector_field'],
                    embedding,
                    config['filters'],
                    limit_per_source
                )
                
                end_time = asyncio.get_event_loop().time()
                logger.info(f"Completed search for table: {table_name} in {end_time - start_time:.3f}s")
                
                # Add source information
                for result in results:
                    result['source_table'] = config['table']
                    
                return results
            
            # Execute all searches in parallel
            logger.info(f"Starting parallel searches for {len(search_configs)} tables")
            search_tasks = [search_table_async(config) for config in search_configs]
            all_results_nested = await asyncio.gather(*search_tasks)
            logger.info("All parallel searches completed")
        
        # Flatten results
        all_results = []
        for results in all_results_nested:
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
                        'cluster_id': str(result['cluster_id']),
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
                        'channel_slug': result.get('channel_slug'),
                        'platform_message_id': result.get('platform_message_id'),
                        'author_id': result['anonymized_author_id'],
                        'created_at': result['platform_created_at'].isoformat() if result['platform_created_at'] else None
                    }
                })
                
            elif result['source_table'] == 'knowledge_base_chunks':
                # Create excerpt (first 200 characters)
                content = result['content'] or ''
                excerpt = content[:200] + '...' if len(content) > 200 else content
                
                # Parse heading hierarchy if it's a JSON string
                heading_hierarchy = result.get('heading_hierarchy')
                if heading_hierarchy and isinstance(heading_hierarchy, str):
                    try:
                        import json
                        heading_hierarchy = json.loads(heading_hierarchy)
                    except:
                        heading_hierarchy = None
                
                formatted.append({
                    'type': 'knowledge_base',
                    'score': float(result['similarity_score']),
                    'excerpt': excerpt,
                    'content': result['content'],
                    'metadata': {
                        'id': str(result['id']),
                        'knowledge_base_id': str(result['knowledge_base_id']),
                        'kb_name': result['kb_name'],
                        'title': result.get('title'),
                        'source_url': result['source_url'],
                        'chunk_index': result['chunk_index'],
                        'total_chunks': result['total_chunks'],
                        'heading_hierarchy': heading_hierarchy,
                        'tenant_id': result['tenant_id']
                    }
                })
        
        return formatted


# Global search service instance
search_service = SearchService()