# Email from noreply@pickem.xomware.com (BRAINSTORM.md 3A). Ported from
# armchair's ses.tf, the newer of the house SES stacks. The domain identity's
# DKIM covers every address under it. Sending code: common/mailer.py.

locals {
  email_domain     = var.domain_name
  mail_from_domain = "mail.${var.domain_name}"

  # What a function that renders or sends email needs beyond lambda_variables.
  email_env = {
    EMAIL_SENDER      = "noreply@${local.email_domain}"
    EMAIL_CONFIG_SET  = aws_sesv2_configuration_set.mail.configuration_set_name
    UNSUBSCRIBE_PARAM = aws_ssm_parameter.email_unsubscribe_secret.name
    API_URL           = "https://${local.api_domain_name}"
    SITE_URL          = "https://${var.domain_name}"
  }
}

resource "aws_sesv2_configuration_set" "mail" {
  configuration_set_name = "${var.app_name}-mail"

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  # SES drops a later send to a suppressed address itself; email_events also
  # records it in pickem-ops so the mailer skips the address before claiming.
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# The configuration set is the identity's default, so a send that omits it
# still reports bounces and complaints.
resource "aws_sesv2_email_identity" "domain" {
  email_identity         = local.email_domain
  configuration_set_name = aws_sesv2_configuration_set.mail.configuration_set_name
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.web_zone.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.email_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# SPF lives on a MAIL FROM subdomain, so the MX below never claims the site's
# hostname takes mail.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = data.aws_route53_zone.web_zone.zone_id
  name    = local.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = data.aws_route53_zone.web_zone.zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# Monitor-only, and no rua: a report address would put an inbox in this public
# repo. Tighten to quarantine once real sending is known to pass DKIM.
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.web_zone.zone_id
  name    = "_dmarc.${local.email_domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none;"]
}

resource "aws_sns_topic" "mail_events" {
  name = "${var.app_name}-mail-events"
}

resource "aws_sesv2_configuration_set_event_destination" "bounce_complaint" {
  configuration_set_name = aws_sesv2_configuration_set.mail.configuration_set_name
  event_destination_name = "bounce-complaint"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT"]

    sns_destination {
      topic_arn = aws_sns_topic.mail_events.arn
    }
  }
}

# HMAC key for unsubscribe links (common/unsubscribe.py). Changing it breaks
# every link already sent. Under the AWS-managed aws/ssm key so the plan role
# can read it on refresh.
resource "aws_ssm_parameter" "email_unsubscribe_secret" {
  name   = "/${var.app_name}/email-unsubscribe-secret"
  type   = "SecureString"
  key_id = "alias/aws/ssm"
  value  = var.email_unsubscribe_secret
}

# Signing and checking unsubscribe links (common/unsubscribe.py).
data "aws_iam_policy_document" "unsubscribe_key" {
  statement {
    sid       = "UnsubscribeKey"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.email_unsubscribe_secret.arn]
  }
}

# Sending as the domain through the configuration set and nothing else. In the
# SES sandbox, SES also authorizes the send against each verified recipient's
# identity, so a sandbox test send to an address outside this domain is denied
# until production access is granted.
data "aws_iam_policy_document" "send_email" {
  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.mail.arn]
  }
}
