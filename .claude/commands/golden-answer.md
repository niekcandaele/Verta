---
description: Generate and save a golden answer for a specific question cluster
allowed-tools: WebFetch, WebSearch, Bash(curl:*), mcp__tidb__db_query, mcp__tidb__db_execute, TodoWrite, Glob, Grep, Read
---

# Generate Golden Answer for: $ARGUMENTS

I'll create and save a golden answer for the question cluster you've provided.

**Expected input formats:**
- Cluster URL: `https://archive.next.takaro.dev/admin/clusters/[cluster-id]`
- Cluster ID: `d2434285-8b76-4c7a-aff2-3127e366f2cc`
- Question text from the cluster

<TodoWrite>
Create a todo list:
1. Extract cluster ID and fetch cluster details
2. Understand available knowledge sources and existing answers
3. Perform initial broad search to identify relevant content types
4. Execute targeted searches based on initial findings
5. Synthesize findings into a comprehensive golden answer
6. Save the golden answer to the database
</TodoWrite>

## Step 1: Extract Cluster Information

First, let me identify the cluster and get its details:

<Bash>
# Extract cluster ID from URL if provided
CLUSTER_ID=$(echo "$ARGUMENTS" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' || echo "$ARGUMENTS")
echo "Extracted cluster ID: $CLUSTER_ID"
</Bash>

<mcp__tidb__db_query>
SELECT
    qc.id,
    qc.representative_text,
    qc.instance_count,
    qc.tenant_id,
    t.slug as tenant_slug,
    ga.id as existing_answer_id
FROM question_clusters qc
JOIN tenants t ON qc.tenant_id = t.id
LEFT JOIN golden_answers ga ON qc.id = ga.cluster_id
WHERE qc.id = '${CLUSTER_ID}'
   OR qc.representative_text LIKE '%$ARGUMENTS%'
LIMIT 1;
</mcp__tidb__db_query>

Get sample questions from this cluster:

<mcp__tidb__db_query>
SELECT original_text, rephrased_text, thread_title
FROM question_instances
WHERE cluster_id = '${CLUSTER_ID}'
LIMIT 5;
</mcp__tidb__db_query>

## Step 2: Discovery - Understanding Available Sources

First, let me check what knowledge bases and existing answers are available:

<mcp__tidb__db_query>
SELECT kb.name, kb.description, COUNT(kbc.id) as chunk_count
FROM knowledge_bases kb
LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
WHERE kb.tenant_id = '${TENANT_ID}'
GROUP BY kb.id, kb.name, kb.description;
</mcp__tidb__db_query>

Check for existing related golden answers:

<mcp__tidb__db_query>
SELECT qc.representative_text, ga.answer, qc.instance_count
FROM golden_answers ga
JOIN question_clusters qc ON ga.cluster_id = qc.id
WHERE ga.tenant_id = '${TENANT_ID}'
AND qc.representative_text != '${REPRESENTATIVE_TEXT}'
AND (qc.representative_text LIKE '%${REPRESENTATIVE_TEXT.split(' ')[0]}%'
     OR ga.answer LIKE '%${REPRESENTATIVE_TEXT.split(' ')[0]}%')
LIMIT 5;
</mcp__tidb__db_query>

## Step 3: Initial Broad Search

Perform initial search to understand what types of content are available:

<Bash>
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${TENANT_SLUG}" \
  -d '{
    "query": "${REPRESENTATIVE_TEXT}",
    "limit": 30,
    "rerank": true
  }' 2>/dev/null | jq '{
    total: .data.total_results,
    by_type: [.data.results[] | .type] | group_by(.) | map({type: .[0], count: length}),
    top_scores: [.data.results[] | {type, score, excerpt: .excerpt[:100]}] | .[0:5],
    knowledge_sources: [.data.results[] | select(.type == "knowledge_base") | .metadata.knowledge_base_name] | unique
  }'
</Bash>

## Step 3: Extract Key Terms and Generate Variations

Based on the question, I'll identify key concepts and search variations:

<Bash>
# Extract key terms and analyze the question structure
echo "${REPRESENTATIVE_TEXT}" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | sort | uniq -c | sort -rn | head -10
</Bash>

## Step 4: Targeted Searches Based on Initial Results

### Search for Error Messages and Troubleshooting
If the question involves errors or issues:

<Bash>
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${TENANT_SLUG}" \
  -d '{
    "query": "error troubleshoot fix ${REPRESENTATIVE_TEXT}",
    "limit": 20,
    "excludeMessages": false
  }' 2>/dev/null | jq '[.data.results[] | select(.excerpt | test("error|fix|troubleshoot|issue"; "i"))] | .[0:10]'
</Bash>

### Search Knowledge Bases for Official Documentation

<Bash>
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${TENANT_SLUG}" \
  -d '{
    "query": "${REPRESENTATIVE_TEXT}",
    "limit": 15,
    "excludeMessages": true
  }' 2>/dev/null | jq '[.data.results[] | select(.type == "knowledge_base")] | .[0:10]'
</Bash>

### Search Messages for Real-World Examples

<Bash>
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: ${TENANT_SLUG}" \
  -d '{
    "query": "${REPRESENTATIVE_TEXT} solved working",
    "limit": 20
  }' 2>/dev/null | jq '[.data.results[] | select(.type == "message" and .score > 0.7)] | .[0:10]'
</Bash>

## Step 5: Deep Dive on Specific Topics

Based on initial results, perform focused searches on identified subtopics:

<Bash>
# This will be dynamically adjusted based on Step 4 results
# Example: If we found references to specific features or configurations
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: takaro" \
  -d '{
    "query": "[specific feature/config from initial search] configuration setup",
    "limit": 10
  }' 2>/dev/null | jq '.data.results'
</Bash>

## Step 6: Verify with Documentation (if gaps found)

If the search reveals gaps in coverage, check official documentation:

<WebSearch>
Search query: site:docs.takaro.io OR site:docs.csmm.app ${REPRESENTATIVE_TEXT}
</WebSearch>

## Step 7: Synthesize Golden Answer

Based on all findings, create a comprehensive golden answer:

**Golden Answer Structure:**
1. Direct answer to the question
2. Step-by-step instructions (if applicable)
3. Common issues and solutions
4. References to official documentation
5. Real-world examples from community

**Answer Quality Checklist:**
- ✓ Addresses the specific question asked
- ✓ Provides actionable information
- ✓ Includes troubleshooting steps for common issues
- ✓ References authoritative sources
- ✓ Uses clear, concise language
- ✓ Follows the pattern of existing golden answers

## Step 8: Save Golden Answer to Database

Now I'll save the golden answer to the database for the identified cluster:

<mcp__tidb__db_execute>
-- First check if answer already exists
SELECT id FROM golden_answers WHERE cluster_id = '${CLUSTER_ID}';
</mcp__tidb__db_execute>

<mcp__tidb__db_execute>
-- Insert or update the golden answer
INSERT INTO golden_answers (
    id,
    cluster_id,
    tenant_id,
    answer,
    answer_format,
    created_by
) VALUES (
    UUID(),
    '${CLUSTER_ID}',
    '${TENANT_ID}',
    '${GOLDEN_ANSWER_CONTENT}',
    'markdown',
    'Claude (generate-golden-answer command)'
)
ON DUPLICATE KEY UPDATE
    answer = VALUES(answer),
    updated_at = CURRENT_TIMESTAMP;
</mcp__tidb__db_execute>

## Success!

✅ Golden answer has been created and saved to the database
- **Cluster ID**: ${CLUSTER_ID}
- **Question**: ${REPRESENTATIVE_TEXT}
- **Answer saved at**: ${CURRENT_TIMESTAMP}

## Metadata:
- **Sources Used**: [List of knowledge bases, message channels, and documentation]
- **Confidence Level**: [Based on source quality and coverage]
- **Related Topics**: [Extracted from search results]