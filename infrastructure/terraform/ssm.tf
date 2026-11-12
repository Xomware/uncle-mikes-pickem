# Read by the frontend build (deploy-frontend.yml) to bake the API base URL in.
resource "aws_ssm_parameter" "api_url" {
  name  = "/${var.app_name}/api-url"
  type  = "String"
  value = "https://${local.api_domain_name}"
}
