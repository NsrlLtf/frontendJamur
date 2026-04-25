class MQTTClient {
    constructor() {
        this.client = null;
        this.reconnectInterval = 3000;
        this.shouldReconnect = true;
        this.onMessageCallbacks = [];
        this.onConnectCallbacks = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const mqttUrl = `${protocol}//broker.hivemq.com:8884/mqtt`;
        
        console.log('Connecting to MQTT:', mqttUrl);
        
        try {
            this.client = mqtt.connect(mqttUrl);
            
            this.client.on('connect', () => {
                console.log('✅ MQTT connected successfully');
                this.updateConnectionStatus(true);
                this.reconnectAttempts = 0;
                
                this.client.subscribe('/jamur/sensor_data');
                this.client.subscribe('/jamur/relay_status');
                this.client.subscribe('/jamur/mode_status');
                this.client.subscribe('/jamur/datetime');
                
                setTimeout(() => {
                    this.send({ type: 'get_data' });
                }, 100);
                
                this.onConnectCallbacks.forEach(callback => callback());
            });
            
            this.client.on('message', (topic, message) => {
                console.log("📨 MQTT received on " + topic + ":", message.toString());
                try {
                    const data = JSON.parse(message.toString());
                    this.onMessageCallbacks.forEach(callback => callback(data));
                } catch (e) {
                    console.error('❌ Error parsing MQTT message:', e);
                    console.error('Raw data:', message.toString());
                }
            });
            
            this.client.on('close', () => {
                console.log('🔌 MQTT disconnected');
                this.updateConnectionStatus(false);
                
                if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`🔄 Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectInterval}ms...`);
                    setTimeout(() => this.connect(), this.reconnectInterval);
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('❌ Max reconnection attempts reached. Please refresh the page.');
                }
            });
            
            this.client.on('error', (error) => {
                console.error('❌ MQTT error:', error);
            });
            
        } catch (error) {
            console.error('❌ Failed to create MQTT client:', error);
        }
    }
    
    send(message) {
        const msgStr = JSON.stringify(message);
        let topic = '/jamur/control';
        
        if (message.type === 'set_mode') {
            topic = '/jamur/set_mode';
        } else if (message.type === 'get_data') {
            topic = '/jamur/get_data';
        } else if (message.type === 'clear_history') {
            topic = '/jamur/clear_history';
        }
        
        console.log('📤 Sending to ' + topic + ':', msgStr);
        this.client.publish(topic, msgStr);
    }
    
    onMessage(callback) {
        this.onMessageCallbacks.push(callback);
    }
    
    onConnect(callback) {
        this.onConnectCallbacks.push(callback);
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
            statusElement.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
        }
        
        document.body.classList.toggle('ws-connected', connected);
        document.body.classList.toggle('ws-disconnected', !connected);
    }
    
    disconnect() {
        console.log('🛑 Disconnecting MQTT...');
        this.shouldReconnect = false;
        if (this.client) {
            this.client.end();
        }
    }
}