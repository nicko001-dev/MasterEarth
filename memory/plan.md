# Plan - IntelliFlood Implementation

## Issue 1: Cartographie 3D - Default basemap + more neighborhood names
- Change default basemap from "osm" to "esri" in GlobeView.tsx
- Add more neighborhood names (Abidjan districts) to PLACE_LABELS in GlobeView.tsx

## Issue 2: Simulations de pluies et d'inondations
- Review objectifSim PNG screenshots to understand simulation parameters
- Ensure simulation API supports the same modes (rain, level, sensor)
- Verify flood model parameters match expected behavior

## Issue 3: Clés API IA - Other providers
- AI providers (groq, mistral, xkiro, openrouter) are defined in ai_providers.py
- The issue is likely in list_free_models filtering or credentials
- Need to verify each provider works without API keys or with proper configuration
- The ai_encryption_key must be set for encrypting/decrypting keys

## Issue 4: Inscription utilisateur (registration)
- register_viewer function exists but may have rate-limiting issues
- Registration creates a viewer role user
- Need to test the registration flow and fix any issues
- Rate limiting: MAX_REGISTRATIONS=5 per 15min per client_id