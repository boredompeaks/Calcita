import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CalcButton: React.FC<{onPress: () => void, onLongPress?: () => void, style: any, textStyle: any, label: string, accessibilityLabel: string}> = 
({ onPress, onLongPress, style, textStyle, label, accessibilityLabel }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => { scale.value = withSpring(0.9); };
    const handlePressOut = () => { scale.value = withSpring(1); };
    
    return (
        <AnimatedPressable
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[style, animatedStyle]}
            accessibilityLabel={accessibilityLabel}
        >
            <Text style={textStyle}>{label}</Text>
        </AnimatedPressable>
    );
}

const CalculatorScreen: React.FC<{onUnlock: () => void}> = ({ onUnlock }) => {
  const [displayValue, setDisplayValue] = useState('0');
  const [operator, setOperator] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(true);

  const handleNumberInput = (num: string) => {
    if (waitingForOperand) {
      setDisplayValue(num);
      setWaitingForOperand(false);
    } else {
      setDisplayValue(displayValue === '0' ? num : displayValue + num);
    }
  };

  const handleOperatorInput = (nextOperator: string) => {
    const inputValue = parseFloat(displayValue);
    if (operator && !waitingForOperand) {
      const result = calculate(parseFloat(previousValue!), inputValue, operator);
      setDisplayValue(String(result));
      setPreviousValue(String(result));
    } else {
      setPreviousValue(displayValue);
    }
    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (prev: number, current: number, op: string) => {
    switch (op) {
      case '+': return prev + current;
      case '-': return prev - current;
      case '*': return prev * current;
      case '/': return prev / current;
      default: return current;
    }
  };

  const handleEquals = () => {
    const inputValue = parseFloat(displayValue);
    if (operator && previousValue !== null) {
      const result = calculate(parseFloat(previousValue), inputValue, operator);
      setDisplayValue(String(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };
  
  const handleLongPressEquals = () => {
    if (['280310', '210610'].includes(displayValue.replace(/\./g, ''))) {
      onUnlock();
    }
  };

  const handleClear = () => {
    if (isAllClear) {
      setOperator(null);
      setPreviousValue(null);
    }
    setDisplayValue('0');
    setWaitingForOperand(true);
  };

  const handlePlusMinus = () => { setDisplayValue(String(parseFloat(displayValue) * -1)); };
  const handlePercent = () => { setDisplayValue(String(parseFloat(displayValue) / 100)); };
  const handleDot = () => { if (!displayValue.includes('.')) setDisplayValue(displayValue + '.'); };

  const isAllClear = waitingForOperand || displayValue === '0';
  const buttons = [
    { label: isAllClear ? 'AC' : 'C', style: 'top', action: handleClear, accessibilityLabel: 'Clear' },
    { label: '+/-', style: 'top', action: handlePlusMinus, accessibilityLabel: 'Plus minus' },
    { label: '%', style: 'top', action: handlePercent, accessibilityLabel: 'Percentage' },
    { label: '/', style: 'operator', action: () => handleOperatorInput('/'), accessibilityLabel: 'Divide' },
    { label: '7', style: 'number', action: () => handleNumberInput('7'), accessibilityLabel: '7' },
    { label: '8', style: 'number', action: () => handleNumberInput('8'), accessibilityLabel: '8' },
    { label: '9', style: 'number', action: () => handleNumberInput('9'), accessibilityLabel: '9' },
    { label: '*', style: 'operator', action: () => handleOperatorInput('*'), accessibilityLabel: 'Multiply' },
    { label: '4', style: 'number', action: () => handleNumberInput('4'), accessibilityLabel: '4' },
    { label: '5', style: 'number', action: () => handleNumberInput('5'), accessibilityLabel: '5' },
    { label: '6', style: 'number', action: () => handleNumberInput('6'), accessibilityLabel: '6' },
    { label: '-', style: 'operator', action: () => handleOperatorInput('-'), accessibilityLabel: 'Subtract' },
    { label: '1', style: 'number', action: () => handleNumberInput('1'), accessibilityLabel: '1' },
    { label: '2', style: 'number', action: () => handleNumberInput('2'), accessibilityLabel: '2' },
    { label: '3', style: 'number', action: () => handleNumberInput('3'), accessibilityLabel: '3' },
    { label: '+', style: 'operator', action: () => handleOperatorInput('+'), accessibilityLabel: 'Add' },
    { label: '0', style: 'number-zero', action: () => handleNumberInput('0'), accessibilityLabel: '0' },
    { label: '.', style: 'number', action: handleDot, accessibilityLabel: 'Decimal point' },
    { label: '=', style: 'operator', action: handleEquals, longAction: handleLongPressEquals, accessibilityLabel: 'Equals' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{displayValue}</Text>
      </View>
      <View style={styles.buttonContainer}>
        {buttons.map((btn, i) => (
          <CalcButton
            key={i}
            style={[styles.button, styles[btn.style as keyof typeof styles]]}
            textStyle={[styles.buttonText, styles[`${btn.style}Text` as keyof typeof styles]]}
            onPress={btn.action}
            onLongPress={btn.longAction}
            label={btn.label}
            accessibilityLabel={btn.accessibilityLabel}
          />
        ))}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  displayContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', padding: 30 },
  displayText: { color: '#fff', fontSize: 96, fontWeight: '300' },
  buttonContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 10 },
  button: { width: '23%', height: '18%', borderRadius: 999, alignItems: 'center', justifyContent: 'center', margin: '1%' },
  buttonText: { fontSize: 32 },
  top: { backgroundColor: '#A5A5A5' },
  topText: { color: '#000' },
  operator: { backgroundColor: '#F1A33B' },
  operatorText: { color: '#fff' },
  number: { backgroundColor: '#333333' },
  numberText: { color: '#fff' },
  'number-zero': { backgroundColor: '#333333', width: '48%', alignItems: 'flex-start', paddingLeft: 35 },
});

export default CalculatorScreen;