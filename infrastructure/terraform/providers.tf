provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.standard_tags
  }
}

data "aws_caller_identity" "current" {}
