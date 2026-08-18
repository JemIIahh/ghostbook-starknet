pub mod ghostbook_anonymizer;

// Mocks are compiled for the package's own tests, and behind the `test_utils` feature for
// downstream consumers that want to reuse them.
#[cfg(test)]
pub mod test_contracts;
#[cfg(feature: 'test_utils')]
pub mod test_contracts;

#[cfg(test)]
pub mod tests;
