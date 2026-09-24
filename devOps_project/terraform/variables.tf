variable "aws_region" {
  description = "AWS region for resources deployment"
  type        = string
  default     = "ap-south-1" # Mumbai region
}

variable "environment" {
  description = "Deployment environment name (e.g. production, staging, dev)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Base project name used for resource naming tags"
  type        = string
  default     = "devops-taskmanager"
}

variable "instance_type" {
  description = "EC2 instance type (t3.small recommended for running Frontend, Backend, Nginx, and Certbot)"
  type        = string
  default     = "t3.small"
}

variable "root_volume_size" {
  description = "Size of the root EBS volume in GB"
  type        = number
  default     = 30
}

variable "vpc_cidr" {
  description = "CIDR block for the dedicated VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to connect via SSH (set to your own IP like '203.0.113.4/32' for maximum security)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_key_name" {
  description = "Name of an existing AWS EC2 Key Pair (leave blank if creating a new one with ssh_public_key)"
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Public SSH key content (e.g., 'ssh-rsa AAAAB3NzaC1...'). Used if ssh_key_name is not provided."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Optional custom domain name for the application (e.g., devops.example.com)"
  type        = string
  default     = ""
}
