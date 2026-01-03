// Demo of JSX/TSX component detection improvement
// These components should NOT be detected as duplicates

export const LoginForm = () => {
  return (
    <div className="form-container">
      <Input 
        type="email" 
        placeholder="Email"
        value={email}
      />
      <Input 
        type="password" 
        placeholder="Password"
        value={password}
      />
      <Button onClick={handleLogin}>
        Login
      </Button>
    </div>
  );
};

export const UserProfile = () => {
  return (
    <div className="form-container">
      <Avatar 
        src={user.avatar} 
        size="large"
      />
      <Card>
        <UserInfo data={user} />
      </Card>
      <ImageGallery images={photos} />
    </div>
  );
};
