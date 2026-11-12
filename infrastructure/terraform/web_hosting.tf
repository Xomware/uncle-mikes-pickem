# S3 + CloudFront + ACM + Route53 for var.domain_name. SSE-S3: the bucket holds
# only the public static bundle, so a CMK would add KMS grants without
# protecting anything.
module "web" {
  source = "git::https://github.com/domgiordano/web-hosting.git?ref=v1.8.0"

  app_name    = var.app_name
  domain_name = var.domain_name
  zone_id     = data.aws_route53_zone.web_zone.zone_id
  waf_acl_arn = data.aws_ssm_parameter.shared_cloudfront_waf_arn.value

  # Required for a trailingSlash static export. CloudFront's default root
  # object applies to "/" only, so without the rewrite every deep route falls
  # through to the error path. Routes are query-param (BRAINSTORM 4A), so an
  # unknown path is a real 404.
  enable_subroute_rewrite = true
  subroute_style          = "directory"
  spa_error_path          = "/404.html"
  spa_error_response_code = 404

  enable_cache        = true
  minimum_tls_version = "TLSv1.2_2021"
  retain_on_delete    = false
}
