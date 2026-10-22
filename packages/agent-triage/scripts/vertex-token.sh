#!/usr/bin/env bash
#
# Copyright (C) 2026 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

# Prints a fresh Vertex AI access token for direct Workload Identity Federation.
# Usage: vertex-token.sh <external_account credentials json written by google-github-actions/auth>
# The federated token lives only as long as the GitHub OIDC token (~5 min), so this is called
# again during long reviews: fetch a new OIDC token, exchange it at Google STS.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <external_account credentials json>" >&2
  exit 2
fi
cfg=$1

url=$(jq -r '.credential_source.url' "$cfg")
auth=$(jq -r '.credential_source.headers.Authorization' "$cfg")
field=$(jq -r '.credential_source.format.subject_token_field_name // "value"' "$cfg")
oidc=$(curl -fsS -H "Authorization: $auth" "$url" | jq -r --arg f "$field" '.[$f]')

jq -n --arg aud "$(jq -r .audience "$cfg")" --arg tt "$(jq -r .subject_token_type "$cfg")" --arg st "$oidc" \
  '{grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", audience: $aud,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: $tt, subject_token: $st}' \
  | curl -fsS -X POST -H 'Content-Type: application/json' --data @- "$(jq -r .token_url "$cfg")" \
  | jq -er '.access_token'
