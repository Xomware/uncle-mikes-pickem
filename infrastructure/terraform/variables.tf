variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "app_name" {
  description = "Resource name prefix. Effectively permanent: buckets and tables can't be renamed."
  type        = string
  default     = "pickem"
}

variable "environment" {
  description = "Tag value only. There is one deployed environment."
  type        = string
  default     = "production"
}

variable "lambda_runtime" {
  type    = string
  default = "python3.12"
}

variable "alarm_email" {
  description = "Where capture alarms go, from Infisical /pickem ALARM_EMAIL."
  type        = string
  sensitive   = true
}
