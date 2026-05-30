const CRITICAL_VIBRATION = 0.8;
const WARNING_VIBRATION = 0.55;
const CRITICAL_TEMPERATURE = 34;
const WARNING_TEMPERATURE = 29;
const CRITICAL_HUMIDITY = 72;
const WARNING_HUMIDITY = 62;

let activeTwinContext = null;

export function setDigitalTwinContext(context) {
  activeTwinContext = context;
}

export function clearDigitalTwinContext(context) {
  if (activeTwinContext === context) {
    activeTwinContext = null;
  }
}

export function getMetricStatus(metric, value) {
  if (metric === 'vibration') {
    if (value >= CRITICAL_VIBRATION) return 'critical';
    if (value >= WARNING_VIBRATION) return 'warning';
  }

  if (metric === 'temperature') {
    if (value >= CRITICAL_TEMPERATURE) return 'critical';
    if (value >= WARNING_TEMPERATURE) return 'warning';
  }

  if (metric === 'humidity') {
    if (value >= CRITICAL_HUMIDITY) return 'critical';
    if (value >= WARNING_HUMIDITY) return 'warning';
  }

  return 'normal';
}

export function getComponentStatus(values = {}) {
  const statuses = Object.entries(values).map(([metric, value]) => getMetricStatus(metric, value));

  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'normal';
}

export function createMockSensorData(time = performance.now()) {
  const phase = time * 0.001;

  return {
    Beam_1: { vibration: Number((0.54 + Math.sin(phase * 1.3) * 0.37).toFixed(2)) },
    Column_1: { vibration: Number((0.28 + Math.sin(phase * 0.8 + 2) * 0.16).toFixed(2)) },
    Wall_1: { humidity: Math.round(58 + Math.sin(phase * 0.65 + 1.2) * 20) },
    Roof_1: { temperature: Math.round(29 + Math.sin(phase * 0.9 + 0.4) * 8) },
  };
}

export function summarizeSensorData(sensorData = {}) {
  return Object.entries(sensorData).map(([componentName, values]) => ({
    componentName,
    values,
    status: getComponentStatus(values),
  }));
}

export function updateSensorData(sensorData) {
  const summary = summarizeSensorData(sensorData);

  if (activeTwinContext?.applySensorData) {
    activeTwinContext.applySensorData(sensorData, summary);
  }

  return summary;
}
