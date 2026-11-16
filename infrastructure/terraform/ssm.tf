# Read by the frontend build (deploy-frontend.yml) to bake the API base URL in.
resource "aws_ssm_parameter" "api_url" {
  name  = "/${var.app_name}/api-url"
  type  = "String"
  value = "https://${local.api_domain_name}"
}

# The super admin portal's allow list (common/superadmin.py). The value comes from
# Infisical, so no address lands in this public repo. To change it, edit the
# secret and re-run the Terraform workflow.
resource "aws_ssm_parameter" "super_admin_emails" {
  name  = "/${var.app_name}/super-admin-emails"
  type  = "StringList"
  value = var.super_admin_emails
}

data "aws_iam_policy_document" "super_admin_read" {
  statement {
    sid       = "SuperAdminEmails"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.super_admin_emails.arn]
  }
}
