// Demo of JSX/TSX component detection
// These components SHOULD be detected as similar (same components)

export const CreateUserForm = () => {
  return (
    <div className="container">
      <Input 
        type="text" 
        label="Name"
        value={name}
      />
      <Input 
        type="email" 
        label="Email"
        value={email}
      />
      <Button onClick={handleCreate}>
        Create User
      </Button>
    </div>
  );
};

export const EditUserForm = () => {
  return (
    <div className="container">
      <Input 
        type="text" 
        label="Full Name"
        value={fullName}
      />
      <Input 
        type="email" 
        label="Email Address"
        value={userEmail}
      />
      <Button onClick={handleSave}>
        Save Changes
      </Button>
    </div>
  );
};
