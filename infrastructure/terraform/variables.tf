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

variable "domain_name" {
  description = "Public hostname for the site. Also the site bucket's name."
  type        = string
  default     = "pickem.xomware.com"
}

variable "route53_zone_name" {
  description = "Shared hosted zone that domain_name lives in."
  type        = string
  default     = "xomware.com"
}

variable "lambda_runtime" {
  type    = string
  default = "python3.12"
}

variable "email_unsubscribe_secret" {
  description = "HMAC key for email unsubscribe links, from Infisical /pickem EMAIL_UNSUBSCRIBE_SECRET."
  type        = string
  sensitive   = true
}

variable "gow_link_secret" {
  description = "HMAC key for the GOW admin email's links, from Infisical /pickem GOW_LINK_SECRET."
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for the game write-ups, from Infisical /pickem ANTHROPIC_API_KEY."
  type        = string
  sensitive   = true
}

variable "alarm_email" {
  description = "Where capture alarms go, from Infisical /pickem ALARM_EMAIL."
  type        = string
  sensitive   = true
}
