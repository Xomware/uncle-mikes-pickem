locals {
  standard_tags = {
    source      = "terraform"
    project     = var.app_name
    environment = var.environment
    owner       = "xomware"
  }

  account_id = data.aws_caller_identity.current.account_id
}
