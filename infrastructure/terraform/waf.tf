# Shared org-wide WAF ACLs, owned by xomware-infrastructure (waf.tf).
data "aws_ssm_parameter" "shared_cloudfront_waf_arn" {
  name = "/xomware/shared/cloudfront-waf-acl-arn"
}

data "aws_ssm_parameter" "shared_regional_waf_arn" {
  name = "/xomware/shared/regional-waf-acl-arn"
}

resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = module.api.stage_arn
  web_acl_arn  = data.aws_ssm_parameter.shared_regional_waf_arn.value
}
