# Question Clustering Requirements

## Problem Statement

Discord support channels contain thousands of questions scattered across threads, making it difficult to identify common issues and knowledge gaps. Support teams manually review messages to find patterns, creating redundant work and missing opportunities to improve documentation.

## Business Goals

- Reduce time to identify common questions by 90%
- Automatically cluster 80% of similar questions
- Process historical messages within 24 hours
- Generate actionable insights about question patterns
- Enable future UI features for question exploration

## Functional Requirements

1. **Thread Classification**: Classify Discord threads as containing questions using ML
2. **Thread Processing**: Process only Discord forum threads (not channel messages)
3. **Question Extraction**: Extract and rephrase the primary question from each thread
4. **Similarity Matching**: Compare new questions against existing ones using vector similarity
5. **Automatic Clustering**: Group questions with >85% similarity into clusters
6. **Thread Mapping**: Maintain links between clusters and original Discord threads
7. **Age Filtering**: Process threads where first message is 5+ days old
8. **Language Support**: English language content only (initial release)
9. **Context Storage**: Store thread titles as additional question context

## Non-Functional Requirements

- **Performance**: Process 1000 messages per minute on CPU-only infrastructure
- **Scalability**: Support millions of messages across multiple tenants
- **Accuracy**: Achieve >90% accuracy in question classification
- **Latency**: API responses within 500ms (classification), 2s (embeddings)
- **Resources**: Run within 4GB RAM for Python services
- **Availability**: Graceful degradation during ML service downtime

## Constraints

- CPU-only environment (no GPU acceleration)
- Must integrate with existing Node.js/TypeScript backend
- Must use TiDB's vector search capabilities
- Must maintain tenant data isolation
- Must containerize Python services with Docker

## Success Metrics

- Question identification time reduced by 90%
- 80% of similar questions automatically clustered
- Historical data processed within 24 hours of deployment
- Support team documentation time reduced by 50%
- Zero data leakage between tenants