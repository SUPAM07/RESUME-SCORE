terraform {
  required_version = ">= 1.9.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }

  backend "gcs" {
    bucket = "resume-score-tf-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── GKE Cluster ─────────────────────────────────────────────────────────────

resource "google_container_cluster" "primary" {
  name                     = "resume-score-cluster"
  location                 = var.region
  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = false

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  network_policy {
    enabled = true
  }
}

resource "google_container_node_pool" "app_nodes" {
  name       = "app-node-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = var.node_count

  node_config {
    machine_type = var.machine_type
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    labels = {
      env = var.environment
      app = "resume-score"
    }
    tags = ["resume-score", var.environment]
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  autoscaling {
    min_node_count = 1
    max_node_count = 10
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# ─── Cloud SQL (PostgreSQL) ───────────────────────────────────────────────────

resource "google_sql_database_instance" "main" {
  name             = "resume-score-db"
  database_version = "POSTGRES_16"
  region           = var.region
  deletion_protection = false

  settings {
    tier = var.db_tier
    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      retained_backups               = 7
    }
    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "main" {
  name     = "resume_score"
  instance = google_sql_database_instance.main.name
}

# ─── Cloud Memorystore (Redis) ────────────────────────────────────────────────

resource "google_redis_instance" "main" {
  name           = "resume-score-redis"
  tier           = "STANDARD_HA"
  memory_size_gb = 2
  region         = var.region
  redis_version  = "REDIS_7_2"

  auth_enabled = true

  labels = {
    env = var.environment
    app = "resume-score"
  }
}

# ─── Artifact Registry ────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "resume-score"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-minimum-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
}
