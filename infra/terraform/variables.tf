variable "project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "GCP region for all resources"
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Deployment environment: development, staging, production"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "node_count" {
  type        = number
  default     = 3
  description = "Initial number of GKE nodes"
}

variable "machine_type" {
  type        = string
  default     = "e2-standard-4"
  description = "GKE node machine type"
}

variable "db_tier" {
  type        = string
  default     = "db-custom-4-16384"
  description = "Cloud SQL machine tier"
}
