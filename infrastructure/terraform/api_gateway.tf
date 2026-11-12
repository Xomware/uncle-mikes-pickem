locals {
  me_endpoints = [
    for l in local.me_lambdas : merge(l, {
      invoke_arn = aws_lambda_function.api["me_${l.name}"].invoke_arn
    })
  ]
  groups_endpoints = [
    for l in local.groups_lambdas : merge(l, {
      invoke_arn = aws_lambda_function.api["groups_${l.name}"].invoke_arn
    })
  ]
  invites_endpoints = [
    for l in local.invites_lambdas : merge(l, {
      invoke_arn = aws_lambda_function.api["invites_${l.name}"].invoke_arn
    })
  ]
  rules_endpoints = [
    for l in local.rules_lambdas : merge(l, {
      invoke_arn = aws_lambda_function.api["rules_${l.name}"].invoke_arn
    })
  ]
  members_endpoints = [
    for l in local.members_lambdas : merge(l, {
      invoke_arn = aws_lambda_function.api["members_${l.name}"].invoke_arn
    })
  ]
}

module "api" {
  source = "git::https://github.com/domgiordano/api-gateway-service.git?ref=v2.8.0"

  app_name        = var.app_name
  domain_name     = local.api_domain_name
  stage_name      = "prod"
  certificate_arn = aws_acm_certificate_validation.api.certificate_arn

  # The module defaults to "CUSTOM", which provisions a Lambda authorizer this
  # stack does not have and fails the plan. Every endpoint also sets it, so no
  # route can inherit something weaker.
  authorization          = "COGNITO_USER_POOLS"
  cognito_user_pool_arns = [data.aws_ssm_parameter.cognito_user_pool_arn.value]

  # The module answers preflights from a MOCK integration that can't read the
  # request's Origin, so a list would always return its first entry. "*" is
  # safe: the API takes a bearer token, never cookies. Real responses echo
  # only the allowed origins (CORS_ALLOW_ORIGIN in the Lambdas).
  allow_origin = "*"

  # Data trace writes full request and response bodies, which carry emails.
  data_trace_enabled = false

  services = {
    me      = { path_prefix = "me", endpoints = local.me_endpoints }
    groups  = { path_prefix = "groups", endpoints = local.groups_endpoints }
    invites = { path_prefix = "invites", endpoints = local.invites_endpoints }
    rules   = { path_prefix = "rules", endpoints = local.rules_endpoints }
    members = { path_prefix = "members", endpoints = local.members_endpoints }
  }
}
