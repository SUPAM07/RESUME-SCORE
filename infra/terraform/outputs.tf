output "cluster_name" {
  value       = google_container_cluster.primary.name
  description = "GKE cluster name"
}

output "cluster_endpoint" {
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
  description = "GKE cluster API endpoint"
}

output "db_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "Cloud SQL connection name"
}

output "redis_host" {
  value       = google_redis_instance.main.host
  description = "Redis instance host"
}

output "registry_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/resume-score"
  description = "Container registry URL"
}
