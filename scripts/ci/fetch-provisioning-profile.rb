#!/usr/bin/env ruby
# frozen_string_literal: true

require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'

key_id = ENV['APP_STORE_CONNECT_API_KEY_ID'] || 'V5BH58HKB7'
issuer_id = ENV['APP_STORE_CONNECT_API_ISSUER_ID'] || '6739aeaa-bae4-4779-9d8c-ae00213e33d9'
key_path = ENV['KEY_PATH'] || File.expand_path("~/.appstoreconnect/private_keys/AuthKey_#{key_id}.p8")
bundle_id = ENV['BUNDLE_ID'] || 'id.botconnector.app'
platform = (ENV['PROFILE_PLATFORM'] || ENV['PLATFORM'] || 'ios').downcase
is_mac = platform == 'mac' || platform == 'macos'
target_ptype = is_mac ? 'MAC_CATALYST_APP_STORE' : 'IOS_APP_STORE'

puts "Target platform: #{is_mac ? 'macOS (Mac Catalyst)' : 'iOS'} (Looking for profile type: #{target_ptype})"

unless File.exist?(key_path)
  warn "Error: Key file not found at #{key_path}"
  exit 1
end

# 1. Generate App Store Connect JWT Token (ES256)
header = { alg: 'ES256', kid: key_id, typ: 'JWT' }
payload = { iss: issuer_id, exp: Time.now.to_i + 1200, aud: 'appstoreconnect-v1' }

def b64url(data)
  Base64.urlsafe_encode64(data, padding: false)
end

signing_input = "#{b64url(header.to_json)}.#{b64url(payload.to_json)}"

ec_key = OpenSSL::PKey::EC.new(File.read(key_path))
der_sig = ec_key.sign('SHA256', signing_input)
asn1 = OpenSSL::ASN1.decode(der_sig)
r = asn1.value[0].value.to_s(2).rjust(32, "\x00")[-32..-1]
s = asn1.value[1].value.to_s(2).rjust(32, "\x00")[-32..-1]
raw_sig = r + s
token = "#{signing_input}.#{b64url(raw_sig)}"

puts "Successfully generated App Store Connect JWT token (Key ID: #{key_id})."

def api_get(path, token)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  req = Net::HTTP::Get.new(uri)
  req['Authorization'] = "Bearer #{token}"
  req['Accept'] = 'application/json'

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  res = http.request(req)
  unless res.is_a?(Net::HTTPSuccess)
    warn "API Error #{res.code}: #{res.body}"
    return nil
  end
  JSON.parse(res.body)
end

def api_post(path, body, token)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  req = Net::HTTP::Post.new(uri)
  req['Authorization'] = "Bearer #{token}"
  req['Content-Type'] = 'application/json'
  req['Accept'] = 'application/json'
  req.body = body.to_json

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  res = http.request(req)
  unless res.is_a?(Net::HTTPSuccess)
    warn "API POST Error #{res.code}: #{res.body}"
    return nil
  end
  JSON.parse(res.body)
end

# 2. Fetch Profiles
puts "Fetching provisioning profiles for bundle ID: #{bundle_id}..."
profiles_resp = api_get("/v1/profiles?include=bundleId&limit=100", token)

target_profile = nil

if profiles_resp && profiles_resp['data']
  bundle_id_map = {}
  (profiles_resp['included'] || []).each do |inc|
    if inc['type'] == 'bundleIds'
      bundle_id_map[inc['id']] = inc.dig('attributes', 'identifier')
    end
  end

  profiles_resp['data'].each do |prof|
    attrs = prof['attributes'] || {}
    state = attrs['profileState']
    ptype = attrs['profileType']
    p_bundle_ref = prof.dig('relationships', 'bundleId', 'data', 'id')
    matched_id = bundle_id_map[p_bundle_ref]

    puts "Found profile: '#{attrs['name']}' (Type: #{ptype}, UUID: #{attrs['uuid']}, State: #{state}, BundleID: #{matched_id})"
    if state == 'ACTIVE' && (matched_id == bundle_id || attrs['name']&.include?(bundle_id) || attrs['name']&.include?('BotConnector'))
      if ptype == target_ptype
        target_profile = prof
        break
      end
    end
  end
end

# If profile is missing for macOS, attempt to auto-create via API
if target_profile.nil? && is_mac
  puts "No existing #{target_ptype} profile found. Attempting to create one via App Store Connect API..."
  b_resp = api_get("/v1/bundleIds?filter[identifier]=#{bundle_id}", token)
  bundle_obj = (b_resp && b_resp['data'] || []).find { |b| b.dig('attributes', 'identifier') == bundle_id }
  bundle_res_id = bundle_obj&.dig('id')

  c_resp = api_get("/v1/certificates?limit=50", token)
  certs = (c_resp && c_resp['data'] || []).select do |c|
    ctype = c.dig('attributes', 'certificateType')
    ['DISTRIBUTION', 'MAC_APP_DISTRIBUTION'].include?(ctype)
  end

  if bundle_res_id && !certs.empty?
    cert_relationships = certs.map { |c| { type: 'certificates', id: c['id'] } }
    create_body = {
      data: {
        type: 'profiles',
        attributes: {
          name: "BotConnector Mac Catalyst App Store",
          profileType: target_ptype
        },
        relationships: {
          bundleId: {
            data: { type: 'bundleIds', id: bundle_res_id }
          },
          certificates: {
            data: cert_relationships
          }
        }
      }
    }
    create_resp = api_post('/v1/profiles', create_body, token)
    if create_resp && create_resp['data']
      target_profile = create_resp['data']
      puts "Successfully created profile: '#{target_profile.dig('attributes', 'name')}' (UUID: #{target_profile.dig('attributes', 'uuid')})"
    else
      warn "Auto-creation returned non-success; will check fallback profiles..."
    end
  else
    warn "Cannot create profile: bundle_res_id=#{bundle_res_id.inspect}, valid certs count=#{certs.size}"
  end
end

if target_profile.nil? && profiles_resp && profiles_resp['data']
  target_profile = profiles_resp['data'].find do |p|
    p.dig('attributes', 'profileState') == 'ACTIVE' && p.dig('attributes', 'profileType') == target_ptype
  end
end

if target_profile.nil?
  warn "No active #{target_ptype} profile found via API! Listing all profiles..."
  all_resp = api_get('/v1/profiles?limit=50', token)
  all_resp['data']&.each do |p|
    warn "- #{p.dig('attributes', 'name')} (#{p.dig('attributes', 'profileType')}, #{p.dig('attributes', 'profileState')})"
  end
  exit 1
end

uuid = target_profile.dig('attributes', 'uuid')
name = target_profile.dig('attributes', 'name')
content_b64 = target_profile.dig('attributes', 'profileContent')

puts "Selected profile: '#{name}' (UUID: #{uuid})"

# 3. Install profile
profiles_dir = File.expand_path('~/Library/MobileDevice/Provisioning Profiles')
FileUtils.mkdir_p(profiles_dir)

profile_path = File.join(profiles_dir, "#{uuid}.mobileprovision")
File.write(profile_path, Base64.decode64(content_b64))

puts "Installed provisioning profile to: #{profile_path}"

# 4. Export environment variables
if ENV['GITHUB_ENV']
  File.open(ENV['GITHUB_ENV'], 'a') do |f|
    f.puts "PROVISIONING_PROFILE_SPECIFIER=#{name}"
    f.puts "PROVISIONING_PROFILE_UUID=#{uuid}"
  end
end

if ENV['GITHUB_OUTPUT']
  File.open(ENV['GITHUB_OUTPUT'], 'a') do |f|
    f.puts "profile_name=#{name}"
    f.puts "profile_uuid=#{uuid}"
  end
end

# 5. Append to Pods-PocketPal.release.xcconfig and ios/Config/Env.xcconfig
[
  File.expand_path('../../ios/Pods/Target Support Files/Pods-PocketPal/Pods-PocketPal.release.xcconfig', __dir__),
  File.expand_path('../../ios/Config/Env.xcconfig', __dir__)
].each do |cfg_file|
  if File.exist?(cfg_file)
    File.open(cfg_file, 'a') do |f|
      f.puts "\n// Automated Signing Configuration for #{is_mac ? 'Mac Catalyst' : 'iOS'} Release"
      f.puts "CODE_SIGN_STYLE = Manual"
      f.puts "CODE_SIGN_IDENTITY = Apple Distribution"
      f.puts "DEVELOPMENT_TEAM = #{ENV['TEAM_ID'] || '7DD999P944'}"
      f.puts "PROVISIONING_PROFILE_SPECIFIER = #{name}"
    end
    puts "Appended signing configuration to #{cfg_file}"
  end
end

puts "PROVISIONING_PROFILE_SPECIFIER=#{name}"
puts "PROVISIONING_PROFILE_UUID=#{uuid}"
