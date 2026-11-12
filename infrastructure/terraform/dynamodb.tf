# Data model: BRAINSTORM.md option 1A. Split by writer: ingest owns pickem-nfl,
# pickem-app is single-table and group-scoped, pickem-ops holds poll runs and
# the mail claim log. Encrypted with the AWS-owned key, like the capture bucket.

resource "aws_dynamodb_table" "nfl" {
  deletion_protection_enabled = true
  name                        = "${var.app_name}-nfl"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"

  attribute {
    name = "PK" # SEASON#2027#W05, GAME#<espnId>, SEASON#2027
    type = "S"
  }
  attribute {
    name = "SK" # WEEK, GAME#<espnId>, INFO#<kind>, STANDINGS
    type = "S"
  }

  point_in_time_recovery { enabled = true }
}

resource "aws_dynamodb_table" "app" {
  deletion_protection_enabled = true
  name                        = "${var.app_name}-app"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"

  attribute {
    name = "PK" # USER#sub, GROUP#g, GROUP#g#S2027, GROUP#g#S2027#W05, INVITE#code
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK" # USER#sub, set on MEMBER items only
    type = "S"
  }
  attribute {
    name = "GSI1SK" # GROUP#g
    type = "S"
  }

  # "My groups".
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  point_in_time_recovery { enabled = true }
}

resource "aws_dynamodb_table" "ops" {
  deletion_protection_enabled = true
  name                        = "${var.app_name}-ops"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"

  attribute {
    name = "PK" # POLL#..., MAIL#<sub>#<group>#<eventId>
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery { enabled = true }
}
