# The shared xomware_users pool and the pickem client, both owned by
# xomware-infrastructure (cognito.tf). The authorizer needs only the pool ARN;
# the frontend build reads the client id and Hosted UI domain from SSM itself.
data "aws_ssm_parameter" "cognito_user_pool_arn" {
  name = "/xomware/shared/cognito/user-pool-arn"
}
