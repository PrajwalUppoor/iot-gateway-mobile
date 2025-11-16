import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { channelsApi, Channel } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type CodeExample = 'esp32' | 'raspberry' | 'python' | 'curl';

const STORAGE_KEYS = {
  CHANNELS: '@iot_workshop_channels',
};

export default function IoTGuideScreen() {
  const { id, apiKey: paramApiKey } = useLocalSearchParams<{ id: string; apiKey?: string }>();
  const router = useRouter();
  const [selectedExample, setSelectedExample] = useState<CodeExample>('esp32');
  const [apiKey, setApiKey] = useState<string>(paramApiKey || '');

  const channelQuery = useQuery({
    queryKey: ['channel', id],
    queryFn: () => channelsApi.get(id),
    enabled: !!id,
  });

  React.useEffect(() => {
    if (!paramApiKey) {
      loadApiKey();
    }
  }, [id]);

  const loadApiKey = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.CHANNELS);
      if (stored) {
        const channels = JSON.parse(stored);
        const channel = channels.find((c: any) => c.id === id);
        if (channel) {
          setApiKey(channel.apiKey);
        }
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  if (!apiKey) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No API key found for this channel</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const channel: Channel | undefined = channelQuery.data;
  const apiUrl = 'http://localhost:8080'; // User needs to replace this

  // Generate sample data
  const sampleData = channel?.allowed_fields.reduce((acc, field) => {
    acc[field] = field === 'temperature' ? 24.5 : 
                 field === 'humidity' ? 60.2 : 
                 Math.random() * 100;
    return acc;
  }, {} as Record<string, number>) || { temperature: 24.5, humidity: 60.2 };

  const examples: Record<CodeExample, string> = {
    esp32: `// ESP32 Arduino Code
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* apiUrl = "${apiUrl}/api/readings";
const char* apiKey = "${apiKey}";

const unsigned long updateInterval = ${(channel?.min_write_interval_seconds || 15) * 1000};
unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected!");
}

void loop() {
  if (millis() - lastUpdate >= updateInterval) {
    lastUpdate = millis();
    
    // Read sensors
    ${Object.keys(sampleData).map(field => 
      `float ${field} = read${field.charAt(0).toUpperCase() + field.slice(1)}();`
    ).join('\n    ')}
    
    sendData(${Object.keys(sampleData).join(', ')});
  }
  delay(100);
}

void sendData(${Object.keys(sampleData).map(field => `float ${field}`).join(', ')}) {
  HTTPClient http;
  StaticJsonDocument<200> doc;
  ${Object.keys(sampleData).map(field => `doc["${field}"] = ${field};`).join('\n  ')}
  
  String json;
  serializeJson(doc, json);
  
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", apiKey);
  
  int code = http.POST(json);
  Serial.print("Response: ");
  Serial.println(code);
  http.end();
}`,

    raspberry: `#!/usr/bin/env python3
# Raspberry Pi IoT Client

import requests
import time
import json

API_URL = "${apiUrl}/api/readings"
API_KEY = "${apiKey}"
INTERVAL = ${channel?.min_write_interval_seconds || 15}

def read_sensors():
    return {
        ${Object.entries(sampleData).map(([field, value]) => 
          `"${field}": ${value}`
        ).join(',\n        ')}
    }

def send_data(data):
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    try:
        r = requests.post(API_URL, json=data, headers=headers)
        if r.status_code == 202:
            print(f"✓ Success: {json.dumps(data)}")
        else:
            print(f"✗ Error {r.status_code}")
    except Exception as e:
        print(f"✗ Error: {e}")

while True:
    data = read_sensors()
    send_data(data)
    time.sleep(INTERVAL)`,

    python: `#!/usr/bin/env python3
import requests
import time

API_URL = "${apiUrl}/api/readings"
API_KEY = "${apiKey}"

data = ${JSON.stringify(sampleData, null, 2)}

headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

response = requests.post(API_URL, json=data, headers=headers)
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")`,

    curl: `# Post Reading
curl -X POST ${apiUrl}/api/readings \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(sampleData, null, 2)}'

# Get Latest
curl -H "x-api-key: ${apiKey}" \\
  ${apiUrl}/api/readings/latest

# Bash Loop
while true; do
  curl -X POST ${apiUrl}/api/readings \\
    -H "x-api-key: ${apiKey}" \\
    -H "Content-Type: application/json" \\
    -d '${JSON.stringify(sampleData)}'
  sleep ${channel?.min_write_interval_seconds || 15}
done`,
  };

  const exampleTabs = [
    { id: 'esp32', name: 'ESP32', icon: '🔌' },
    { id: 'raspberry', name: 'Raspberry Pi', icon: '🥧' },
    { id: 'python', name: 'Python', icon: '🐍' },
    { id: 'curl', name: 'curl/Bash', icon: '💻' },
  ];

  if (channelQuery.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🔌 IoT Integration Guide</Text>
          <Text style={styles.subtitle}>
            Connect your IoT devices to {channel?.name || 'this channel'}
          </Text>
        </View>

        {/* API Key Section */}
        <View style={styles.apiKeyCard}>
          <Text style={styles.cardTitle}>🔑 Your API Key</Text>
          <View style={styles.apiKeyBox}>
            <Text style={styles.apiKeyText} selectable>
              {apiKey}
            </Text>
          </View>
          <Text style={styles.helperText}>Long press to copy</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Channel ID:</Text>
              <Text style={styles.infoValue} selectable>
                {id}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Allowed Fields:</Text>
              <Text style={styles.infoValue}>
                {channel?.allowed_fields.join(', ')}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Min Write Interval:</Text>
              <Text style={styles.infoValue}>
                {channel?.min_write_interval_seconds}s
              </Text>
            </View>
          </View>
        </View>

        {/* Code Examples */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 Code Examples</Text>

          {/* Tabs */}
          <View style={styles.tabs}>
            {exampleTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  selectedExample === tab.id && styles.tabActive,
                ]}
                onPress={() => setSelectedExample(tab.id as CodeExample)}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectedExample === tab.id && styles.tabTextActive,
                  ]}
                >
                  {tab.icon} {tab.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Code Display */}
          <View style={styles.codeBox}>
            <Text style={styles.codeText} selectable>
              {examples[selectedExample]}
            </Text>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsTitle}>📚 Setup Instructions:</Text>
            {selectedExample === 'esp32' && (
              <Text style={styles.instructionsText}>
                • Install Arduino IDE{'\n'}
                • Add ESP32 board support{'\n'}
                • Install ArduinoJson library{'\n'}
                • Update WiFi credentials{'\n'}
                • Upload and monitor Serial
              </Text>
            )}
            {selectedExample === 'raspberry' && (
              <Text style={styles.instructionsText}>
                • Install: pip3 install requests{'\n'}
                • Save as iot_client.py{'\n'}
                • Make executable: chmod +x{'\n'}
                • Run: python3 iot_client.py{'\n'}
                • Add to rc.local for auto-start
              </Text>
            )}
            {selectedExample === 'python' && (
              <Text style={styles.instructionsText}>
                • Install: pip install requests{'\n'}
                • Works on any OS with Python 3.6+{'\n'}
                • Run: python iot-client.py{'\n'}
                • Customize for your sensors
              </Text>
            )}
            {selectedExample === 'curl' && (
              <Text style={styles.instructionsText}>
                • Pre-installed on most systems{'\n'}
                • Great for testing{'\n'}
                • Save bash script for automation{'\n'}
                • Replace YOUR_API_URL with actual URL
              </Text>
            )}
          </View>
        </View>

        {/* Best Practices */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💡 Best Practices</Text>
          <Text style={styles.tipText}>
            ✓ Respect min write interval ({channel?.min_write_interval_seconds}s){'\n'}
            ✓ Store API key securely{'\n'}
            ✓ Implement error handling{'\n'}
            ✓ Log data locally as backup{'\n'}
            ✓ Use HTTPS in production
          </Text>
        </View>

        {/* Common Issues */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚨 Common Issues</Text>
          <Text style={styles.tipText}>
            ⚠ 429 Rate Limited: Sending too fast{'\n'}
            ⚠ 401 Unauthorized: Check API key{'\n'}
            ⚠ 400 Bad Request: Invalid fields{'\n'}
            ⚠ Connection refused: Check URL{'\n'}
            ⚠ SSL errors: Update certificates
          </Text>
        </View>

        {/* Test Command */}
        <View style={styles.testCard}>
          <Text style={styles.cardTitle}>🧪 Test Your Integration</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText} selectable>
              {`curl -X POST ${apiUrl}/api/readings \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(sampleData, null, 2)}'`}
            </Text>
          </View>
          <Text style={styles.helperText}>
            Expected: {`{"ok": true}`} with HTTP 202
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  apiKeyCard: {
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  apiKeyBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#0ea5e9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  apiKeyText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoItem: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 12,
    color: '#0c4a6e',
    fontFamily: 'monospace',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  tabActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  codeBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#f0f0f0',
    lineHeight: 16,
  },
  instructionsBox: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#90caf9',
    borderRadius: 8,
    padding: 12,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: '#1565c0',
    lineHeight: 20,
  },
  tipText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  testCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
