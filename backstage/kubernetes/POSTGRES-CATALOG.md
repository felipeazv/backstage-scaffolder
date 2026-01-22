# PostgreSQL Catalog Setup for Production Kubernetes

This guide covers deploying PostgreSQL-based catalog storage for production Kubernetes environments.

## 🗃️ Overview

The PostgreSQL catalog provides:
- **Persistent catalog storage** across environment restarts
- **High-performance entity queries** with optimized indexes
- **Production-ready features** like audit logging and relationship management
- **Environment parity** from development through production

## 🚀 Quick Setup

### 1. Create Namespace (if not exists)
```bash
kubectl create namespace backstage
```

### 2. Update PostgreSQL Credentials
```bash
# IMPORTANT: Change default passwords for production!
# Edit the secret in postgres-catalog-deployment.yaml

# Generate secure base64 encoded passwords:
echo -n "your-secure-db-password" | base64
echo -n "your-db-username" | base64  
echo -n "backstage_catalog" | base64

# Update the secret in postgres-catalog-deployment.yaml with your values
```

### 3. Deploy PostgreSQL Catalog
```bash
kubectl apply -f postgres-catalog-deployment.yaml
```

### 4. Verify Deployment
```bash
# Check PostgreSQL pod status
kubectl get pods -n backstage -l app=postgres-catalog

# Check service
kubectl get svc -n backstage postgres-catalog

# Check logs
kubectl logs -n backstage -l app=postgres-catalog

# Test database connection
kubectl exec -n backstage deployment/postgres-catalog -- psql -U backstage -d backstage_catalog -c "SELECT version();"
```

## 🔧 Configuration Options

### Storage Classes
Configure appropriate storage for your environment:

```yaml
# In postgres-catalog-deployment.yaml, update volumeClaimTemplates:
spec:
  storageClassName: "fast-ssd"  # or your preferred storage class
  resources:
    requests:
      storage: 100Gi  # Adjust based on expected catalog size
```

### Resource Limits
Adjust PostgreSQL resources based on your cluster capacity:

```yaml
resources:
  requests:
    memory: "1Gi"      # Minimum for production
    cpu: "500m"
  limits:
    memory: "4Gi"      # Scale based on catalog size
    cpu: "2000m"
```

### High Availability (Future)
For production HA, consider:
- **PostgreSQL Operator** (e.g., Crunchy, Zalando)
- **Master-Replica setup** with automatic failover
- **Backup and recovery** strategies

## 🔐 Security Considerations

### 1. Change Default Passwords
```bash
# Never use default passwords in production!
kubectl create secret generic postgres-catalog-credentials \
  --namespace=backstage \
  --from-literal=POSTGRES_DB=backstage_catalog \
  --from-literal=POSTGRES_USER=backstage_prod \
  --from-literal=POSTGRES_PASSWORD=your-super-secure-password
```

### 2. Network Policies
The deployment includes NetworkPolicy to restrict database access:
- Only `scaffolder-service` and `backstage` pods can connect
- No external access to database

### 3. Security Context
- Runs as non-root user (postgres:999)
- Read-only root filesystem where possible
- No privilege escalation

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# Database health
kubectl exec -n backstage deployment/postgres-catalog -- pg_isready

# Catalog statistics
curl -s http://scaffolder-service/api/catalog/stats
```

### Backup Strategy
```bash
# Example backup command (run from a scheduled job)
kubectl exec -n backstage deployment/postgres-catalog -- \
  pg_dump -U backstage backstage_catalog > catalog-backup-$(date +%Y%m%d).sql
```

### Database Maintenance
```bash
# Connect to database for maintenance
kubectl exec -it deployment/postgres-catalog -n backstage -- \
  psql -U backstage -d backstage_catalog

# Example maintenance queries:
-- View catalog statistics
SELECT kind, COUNT(*) as count FROM entities GROUP BY kind;

-- View entity audit log
SELECT entity_ref, operation, changed_at FROM entity_audit_log ORDER BY changed_at DESC LIMIT 10;

-- Cleanup old audit logs (older than 90 days)
DELETE FROM entity_audit_log WHERE changed_at < NOW() - INTERVAL '90 days';
```

## 🔄 Migration from File-based Storage

If migrating from file-based catalog:

1. Deploy PostgreSQL catalog
2. Update scaffolder service configuration
3. Re-scaffold services to populate catalog
4. Verify catalog data consistency

## 🎯 Performance Tuning

### PostgreSQL Configuration
Consider these PostgreSQL settings for production:

```sql
-- Connect as superuser and adjust for your environment
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.7;
ALTER SYSTEM SET wal_buffers = '16MB';
SELECT pg_reload_conf();
```

### Monitoring Queries
```sql
-- Monitor slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Monitor database connections
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Monitor table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size 
FROM pg_tables 
WHERE schemaname = 'public';
```

## 🚨 Troubleshooting

### Common Issues

1. **Pod stuck in Pending state**
   ```bash
   kubectl describe pod -n backstage -l app=postgres-catalog
   # Check for storage class issues or resource constraints
   ```

2. **Connection refused errors**
   ```bash
   kubectl logs -n backstage -l app=postgres-catalog
   # Check PostgreSQL initialization logs
   ```

3. **Permission denied**
   ```bash
   # Verify secret exists and has correct format
   kubectl get secret -n backstage postgres-catalog-credentials -o yaml
   ```

4. **Catalog queries failing**
   ```bash
   # Check scaffolder service logs
   kubectl logs -n backstage -l app=scaffolder-service
   # Verify environment variables are set correctly
   ```

## 📈 Scaling Considerations

- **Horizontal scaling**: Use PostgreSQL operators for read replicas
- **Vertical scaling**: Increase CPU/Memory based on catalog size
- **Storage scaling**: Monitor disk usage and expand PVC as needed
- **Connection pooling**: Consider pgBouncer for high-load scenarios